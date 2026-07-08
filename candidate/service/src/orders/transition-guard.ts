import { Injectable } from '@nestjs/common';

import { InvalidTransitionException } from './exceptions/invalid-transition.exception';
import { type OrderStatus, VALID_TRANSITIONS } from './order-status.enum';

@Injectable()
export class TransitionGuard {
  assertValid(current: OrderStatus, next: OrderStatus): void {
    if (!VALID_TRANSITIONS[current].includes(next)) {
      throw new InvalidTransitionException(current, next);
    }
  }
}
