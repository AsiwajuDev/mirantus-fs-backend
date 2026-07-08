import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';

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

@Injectable()
export class OrdersRepository {
  constructor(
    @InjectRepository(Order) private readonly repository: Repository<Order>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // Insert-first, per `database-conventions`: never SELECT-then-INSERT.
  // Concurrent duplicate requests are resolved by the database's unique
  // constraint, not application-level locking.
  async insertIdempotent(
    input: CreateOrderInput,
  ): Promise<IdempotentInsertResult> {
    try {
      const order = this.repository.create(input);
      await this.repository.insert(order);
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
      const updated = await manager.getRepository(Order).save({
        ...order,
        status: next,
      });

      await manager.getRepository(OrderStatusAudit).insert({
        orderId: order.id,
        previousStatus: order.status,
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
