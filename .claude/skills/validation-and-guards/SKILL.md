---
name: validation-and-guards
description: How input is validated before it reaches business logic, and how output is checked before it leaves the process. Use for any controller, DTO, guard, or interceptor.
---

# Validation — Before and After

Validation must happen at both boundaries:

1. **Before business logic executes** — using Pipes and Guards.
2. **Before data leaves the service** — using Response Interceptors.

---

# Before: Pipes + Guards

## DTO Validation

Every DTO field must have explicit `class-validator` decorators.

Example:

```ts
export class CreateOrderDto {
  @IsUUID()
  partnerId: string;

  @IsString()
  @IsNotEmpty()
  patientReference: string;

  @IsString()
  @IsNotEmpty()
  requestedLocation: string;

  @IsIn(['routine', 'urgent'])
  priority: 'routine' | 'urgent';
}
```

Requirements:

- Every field must define its validation rules.
- Validation must not rely on implicit type coercion.
- Controllers must not manually validate request fields.

---

## Global ValidationPipe

The global `ValidationPipe` is responsible for rejecting invalid input.

Required configuration:

```ts
new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
})
```

Behavior:

- `whitelist: true`
  - Removes properties without decorators.

- `forbidNonWhitelisted: true`
  - Rejects unknown properties instead of silently ignoring them.

- `transform: true`
  - Converts payloads into DTO instances where appropriate.

---

# Guards and Business Preconditions

Not all validation is field validation.

Rules involving domain state belong outside controllers.

Examples:

- Whether a status transition is allowed.
- Whether a user has permission.
- Whether an operation is valid for the current resource state.

These rules should live in:

- Dedicated Guards, or
- Reusable guard-like service methods.

Avoid scattered controller checks.

---

## Example: Transition Guard

```ts
class TransitionGuard {
  assertValid(current: OrderStatus, next: OrderStatus): void {
    if (!VALID_TRANSITIONS[current]?.includes(next)) {
      throw new InvalidTransitionException(current, next);
    }
  }
}
```

Benefits:

- Centralized domain rules.
- Reusable across endpoints.
- Independently testable.

---

# After: Response Interceptor

Every outgoing response must pass through a response-shaping interceptor.

Responsibilities:

- Remove internal fields.
- Prevent accidental data leakage.
- Normalize response envelopes.
- Ensure consistent API responses.

Example:

```ts
@Injectable()
export class ResponseShapeInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      map(data => this.strip(data)),
    );
  }
}
```

---

# Why Response Validation Matters

Input validation alone is insufficient.

An endpoint can correctly reject invalid input but still expose sensitive internal data.

Examples of response leaks:

- Internal database IDs.
- Raw entity metadata.
- Audit foreign keys.
- Internal implementation fields.

The service boundary must protect both:

```text
Incoming Request
        ↓
Guards + Pipes
        ↓
Business Logic
        ↓
Response Interceptor
        ↓
Outgoing Response
```

Both sides of the boundary require validation.