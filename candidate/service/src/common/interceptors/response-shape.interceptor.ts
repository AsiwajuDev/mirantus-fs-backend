import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { instanceToPlain } from 'class-transformer';
import { map, type Observable } from 'rxjs';

// Per validation-and-guards / SPEC.md §4: strips internal-only fields
// (e.g. `Order.idempotencyKey`, marked `@Exclude()`) from every outgoing
// response, regardless of endpoint. Cross-cutting, so it lives in
// src/common/ rather than any one feature module.
@Injectable()
export class ResponseShapeInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(map((data: unknown) => instanceToPlain(data)));
  }
}
