import { ConflictException } from '@nestjs/common';

import type { OrderStatus } from '../order-status.enum';

// Per the `error-handling` skill: `from`/`to` must go through `super()`'s
// structured response object, not just live as instance fields, since the
// global exception filter (Phase 5) reads `exception.getResponse()` for
// every `HttpException` with no per-type special casing. A plain-string
// `super(message)` would make `getResponse()` omit `from`/`to` entirely,
// silently breaking SPEC.md §5's required 409 body shape. The fields are
// also set directly for convenient typed access outside the filter.
export class InvalidTransitionException extends ConflictException {
  readonly from: OrderStatus;
  readonly to: OrderStatus;

  constructor(from: OrderStatus, to: OrderStatus) {
    super({ message: `Cannot transition from ${from} to ${to}`, from, to });
    this.from = from;
    this.to = to;
  }
}
