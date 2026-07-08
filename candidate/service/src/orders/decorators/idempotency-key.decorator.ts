import {
  BadRequestException,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { Request } from 'express';

// Exported separately (not just the decorator below) so unit tests can
// call it directly with a mock ExecutionContext, per Nest's documented
// pattern for testing custom param decorators.
export function idempotencyKeyFactory(
  _data: unknown,
  ctx: ExecutionContext,
): string {
  const request = ctx.switchToHttp().getRequest<Request>();
  const value = request.headers['idempotency-key'];

  if (typeof value !== 'string' || !isUUID(value)) {
    throw new BadRequestException(
      'Idempotency-Key header must be a valid UUID',
    );
  }

  return value;
}

// `@Headers()` (unlike `@Param`/`@Query`/`@Body`) doesn't accept pipes,
// so header validation needs its own param decorator to satisfy
// SPEC.md §4: missing or malformed (non-UUID) `Idempotency-Key` → 400,
// enforced before the handler body runs, same as any other pipe.
export const IdempotencyKey = createParamDecorator(idempotencyKeyFactory);
