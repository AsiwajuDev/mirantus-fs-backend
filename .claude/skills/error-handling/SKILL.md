---
name: error-handling
description: Custom exception classes and the global exception filter that gives every error response the same shape. Use whenever a service throws or a new failure mode is introduced.
---

# Error Handling

Use semantic exceptions and a centralized exception filter to provide consistent error handling across the service.

---

# Custom Exceptions

## Use Named Exceptions

Create custom exception classes for every meaningful failure mode.

Example:

```ts
export class InvalidTransitionException extends ConflictException {
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Cannot transition from ${from} to ${to}`);
  }
}

export class OrderNotFoundException extends NotFoundException {
  constructor(id: string) {
    super(`Order ${id} not found`);
  }
}
```

Benefits:

- Makes failures explicit.
- Improves debugging.
- Allows the exception filter and logs to preserve meaningful context.
- Keeps domain failures distinguishable.

---

## Avoid Generic Exceptions

Never throw:

```ts
throw new Error('Something went wrong');
```

or:

```ts
throw new HttpException('Invalid request', 400);
```

from service logic.

Avoid inline error construction because:

- Failure reasons become unclear.
- Error handling becomes inconsistent.
- Logs lose domain meaning.

Instead, create a named exception representing the failure.

---

# Service-Level Error Handling

Services should handle unexpected failures while preserving known application exceptions.

Example:

```ts
async updateStatus(
  id: OrderID,
  next: OrderStatus,
): Promise<Order> {
  try {
    const order = await this.repo.findById(id);

    if (!order) {
      throw new OrderNotFoundException(id);
    }

    this.transitionGuard.assertValid(order.status, next);

    return await this.repo.applyTransition(order, next);
  } catch (err) {
    if (err instanceof HttpException) {
      throw err;
    }

    this.logger.error(
      'Unexpected error updating order status',
      {
        id,
        error: err,
      },
    );

    throw new InternalServerErrorException();
  }
}
```

Rules:

- Known business failures should pass through unchanged.
- Unexpected failures should be logged.
- Internal implementation details should not leak to API consumers.

---

# Global Exception Filter

All errors must pass through a global exception filter.

The filter is responsible for:

- Normalizing error responses.
- Adding request metadata.
- Ensuring consistent API behavior.
- Preventing controllers/services from manually constructing error payloads.

---

## Standard Error Response Shape

Every error should follow this structure:

```json
{
  "statusCode": 409,
  "error": "InvalidTransitionException",
  "message": "Cannot transition from completed to accepted",
  "path": "/orders/123/status",
  "timestamp": "2026-07-07T10:00:00.000Z"
}
```

---

# Error Flow

The application error flow should be:

```text
Service / Guard / Repository
            ↓
Semantic Exception
            ↓
Global Exception Filter
            ↓
Consistent API Error Response
```

Controllers and services must never manually create error JSON responses.