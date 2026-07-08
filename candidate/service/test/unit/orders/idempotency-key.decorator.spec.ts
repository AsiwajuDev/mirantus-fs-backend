import { BadRequestException, type ExecutionContext } from '@nestjs/common';

import { idempotencyKeyFactory } from '../../../src/orders/decorators/idempotency-key.decorator';

function contextWithHeader(value: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { 'idempotency-key': value } }),
    }),
  } as unknown as ExecutionContext;
}

describe('idempotencyKeyFactory', () => {
  it('returns the header value when it is a valid UUID', () => {
    const uuid = 'c4a2d1e5-0000-4000-8000-000000000099';

    expect(idempotencyKeyFactory(undefined, contextWithHeader(uuid))).toBe(
      uuid,
    );
  });

  it('throws BadRequestException when the header is missing', () => {
    expect(() =>
      idempotencyKeyFactory(undefined, contextWithHeader(undefined)),
    ).toThrow(BadRequestException);
  });

  it('throws BadRequestException when the header is not a valid UUID', () => {
    expect(() =>
      idempotencyKeyFactory(undefined, contextWithHeader('not-a-uuid')),
    ).toThrow(BadRequestException);
  });

  it('throws BadRequestException when the header is repeated (array value)', () => {
    // Express represents a repeated header as string[], not a string —
    // `typeof value !== 'string'` must reject this, not attempt to
    // silently pick the first/last entry.
    const uuid = 'c4a2d1e5-0000-4000-8000-000000000099';

    expect(() =>
      idempotencyKeyFactory(undefined, contextWithHeader([uuid, uuid])),
    ).toThrow(BadRequestException);
  });
});
