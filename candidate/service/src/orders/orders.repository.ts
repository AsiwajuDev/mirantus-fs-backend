import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  type FindOptionsWhere,
  QueryFailedError,
  Repository,
} from 'typeorm';

import { OrderStatusAudit } from './entities/order-status-audit.entity';
import { Order } from './entities/order.entity';
import type { OrderStatus } from './order-status.enum';

// Name of the composite unique constraint from the Phase 3 migration —
// (partnerId, idempotencyKey), scoped per partner per SPEC.md §2.
const IDEMPOTENCY_KEY_CONSTRAINT = 'idx_orders_idempotency_key';

// Derived from `Order` (not hand-duplicated) so a future entity field
// change can't silently drift out of sync with this input shape.
export type CreateOrderInput = Pick<
  Order,
  | 'partnerId'
  | 'patientReference'
  | 'requestedLocation'
  | 'priority'
  | 'idempotencyKey'
>;

export interface IdempotentInsertResult {
  order: Order;
  isNew: boolean;
}

export interface OrderFilters {
  status?: OrderStatus;
  partnerId?: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedOrders {
  data: Order[];
  total: number;
}

@Injectable()
export class OrdersRepository {
  constructor(
    @InjectRepository(Order) private readonly repository: Repository<Order>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // Insert-first, per `database-conventions`: never SELECT-then-INSERT.
  // Concurrent duplicate requests are resolved by the database's unique
  // constraint, not application-level locking. A genuinely new order
  // also needs its creation audit row — SPEC.md §4 requires it in the
  // same transaction as the insert, so both happen together here rather
  // than as a separate follow-up step.
  async insertIdempotent(
    input: CreateOrderInput,
  ): Promise<IdempotentInsertResult> {
    try {
      const order = await this.dataSource.transaction(async (manager) => {
        const orderRepo = manager.getRepository(Order);
        const newOrder = orderRepo.create(input);
        newOrder.status = 'received';
        await orderRepo.insert(newOrder);

        await manager.getRepository(OrderStatusAudit).insert({
          orderId: newOrder.id,
          previousStatus: null,
          newStatus: newOrder.status,
          changedBy: input.partnerId,
        });

        return newOrder;
      });

      return { order, isNew: true };
    } catch (err) {
      if (!this.isIdempotencyKeyViolation(err)) {
        throw err;
      }

      // SPEC.md §4: replay (same body or not) returns the row's *current*
      // state, matched by the same (partnerId, idempotencyKey) pair the
      // constraint enforces — never a fresh lookup keyed on the body.
      const existing = await this.repository.findOneByOrFail({
        partnerId: input.partnerId,
        idempotencyKey: input.idempotencyKey,
      });
      return { order: existing, isNew: false };
    }
  }

  async findById(id: string): Promise<Order | null> {
    return this.repository.findOneBy({ id });
  }

  async findMany(
    filters: OrderFilters,
    pagination: PaginationParams,
  ): Promise<PaginatedOrders> {
    const where: FindOptionsWhere<Order> = {};
    if (filters.status !== undefined) {
      where.status = filters.status;
    }
    if (filters.partnerId !== undefined) {
      where.partnerId = filters.partnerId;
    }

    const [data, total] = await this.repository.findAndCount({
      where,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      order: { createdAt: 'DESC' },
    });

    return { data, total };
  }

  // logging-and-audit: order update + audit insert must be atomic — both
  // committed together, or neither. `changedBy` is the caller's job to
  // supply correctly (partnerId on creation, the literal "system" on the
  // PATCH transition endpoint, per SPEC.md §4) — this method doesn't
  // guess it.
  async applyStatusTransition(
    order: Order,
    next: OrderStatus,
    changedBy: string,
  ): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      const previousStatus = order.status;
      // Mutate the existing `Order` instance rather than spreading it
      // into a plain object literal — spreading drops the prototype, so
      // `save()` would return a plain object that ResponseShapeInterceptor's
      // class-transformer can't recognize as an `Order`, silently
      // un-doing `idempotencyKey`'s `@Exclude()`.
      const orderRepo = manager.getRepository(Order);
      const updated = await orderRepo.save(
        orderRepo.merge(order, { status: next }),
      );

      await manager.getRepository(OrderStatusAudit).insert({
        orderId: order.id,
        previousStatus,
        newStatus: next,
        changedBy,
      });

      return updated;
    });
  }

  private isIdempotencyKeyViolation(err: unknown): boolean {
    if (!(err instanceof QueryFailedError)) {
      return false;
    }

    const driverError = err.driverError as {
      code?: string;
      constraint?: string;
    };

    return (
      driverError.code === '23505' &&
      driverError.constraint === IDEMPOTENCY_KEY_CONSTRAINT
    );
  }
}
