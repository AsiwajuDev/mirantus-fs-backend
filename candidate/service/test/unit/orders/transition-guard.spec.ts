import { InvalidTransitionException } from '../../../src/orders/exceptions/invalid-transition.exception';
import type { OrderStatus } from '../../../src/orders/order-status.enum';
import { TransitionGuard } from '../../../src/orders/transition-guard';

describe('TransitionGuard', () => {
  let guard: TransitionGuard;

  beforeEach(() => {
    guard = new TransitionGuard();
  });

  describe('valid transitions', () => {
    const validCases: Array<[OrderStatus, OrderStatus]> = [
      ['received', 'accepted'],
      ['received', 'rejected'],
      ['accepted', 'in_progress'],
      ['accepted', 'cancelled'],
      ['in_progress', 'completed'],
      ['in_progress', 'cancelled'],
    ];

    it.each(validCases)('allows %s -> %s', (current, next) => {
      expect(() => guard.assertValid(current, next)).not.toThrow();
    });
  });

  describe('invalid transitions', () => {
    const invalidCases: Array<[OrderStatus, OrderStatus]> = [
      ['received', 'in_progress'],
      ['accepted', 'received'],
      ['in_progress', 'received'],
      ['completed', 'accepted'],
      ['rejected', 'accepted'],
      ['cancelled', 'accepted'],
    ];

    it.each(invalidCases)('rejects %s -> %s', (current, next) => {
      expect(() => guard.assertValid(current, next)).toThrow(
        InvalidTransitionException,
      );
    });

    // SPEC.md §3, called out explicitly: "no state has itself listed as
    // a valid next state, so re-submitting the current status ... is a
    // 409, not a no-op 200." Every status (including the three terminal
    // ones) must reject its own self-transition — none of this was
    // covered anywhere else in the suite (unit or integration).
    const selfTransitionCases: OrderStatus[] = [
      'received',
      'accepted',
      'in_progress',
      'completed',
      'rejected',
      'cancelled',
    ];

    it.each(selfTransitionCases)(
      'rejects the self-transition %s -> %s as a 409, not a no-op',
      (status) => {
        expect(() => guard.assertValid(status, status)).toThrow(
          InvalidTransitionException,
        );
      },
    );

    it('carries the from/to states and a matching message on the thrown exception', () => {
      expect.assertions(5);

      try {
        guard.assertValid('completed', 'accepted');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidTransitionException);
        const exception = err as InvalidTransitionException;
        expect(exception.from).toBe('completed');
        expect(exception.to).toBe('accepted');
        expect(exception.message).toBe(
          'Cannot transition from completed to accepted',
        );
        // Per SPEC.md §5: the global exception filter (Phase 5) reads
        // `getResponse()`, so `from`/`to` must survive there too, not
        // just as instance fields.
        expect(exception.getResponse()).toMatchObject({
          message: 'Cannot transition from completed to accepted',
          from: 'completed',
          to: 'accepted',
        });
      }
    });
  });
});
