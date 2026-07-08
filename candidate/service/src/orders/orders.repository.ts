import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import { Order } from './entities/order.entity';

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
