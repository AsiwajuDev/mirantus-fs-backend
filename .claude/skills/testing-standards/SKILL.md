---
name: testing-standards
description: Test structure, coverage targets, and unit vs integration boundaries. Use when writing or reviewing any test.
---

# Testing Standards

Follow these standards when creating or reviewing tests.

Tests must verify behavior, not implementation details.

---

# Test Structure

The test directory should mirror the application structure.

Example:

```text
test/
├── unit/
│   └── orders/
│       ├── orders.service.spec.ts
│       └── transition-guard.spec.ts
└── integration/
    └── orders.e2e-spec.ts
```

---

# Test Boundaries

## Unit Tests

Use unit tests for isolated business logic.

Examples:

- Services.
- Guards.
- Domain validation.
- Utility logic.

Unit tests may mock dependencies where appropriate.

---

## Integration Tests

Integration tests must verify behavior against real infrastructure.

Requirements:

- Use the real containerized PostgreSQL instance.
- Exercise the complete HTTP flow.
- Do not mock repositories.

Example:

```text
HTTP Request
      ↓
Controller
      ↓
Service
      ↓
Repository
      ↓
PostgreSQL Container
```

Repository mocking hides database behavior that is critical to correctness, especially:

- Unique constraint enforcement.
- Transaction behavior.
- Idempotency race handling.

---

# Coverage Targets

## Critical Business Logic

The following require:

```text
100% coverage
```

### Idempotency Logic

Because duplicate request handling depends on database guarantees.

### Status Transition Guard

Because invalid state changes must never reach persistence.

Any missing branch is considered a gap in core behavior.

---

## Services

General service coverage target:

```text
80%
```

---

## Endpoint Coverage

Every endpoint must have at least one integration test against the real PostgreSQL container.

Do not rely exclusively on mocked unit tests.

---

# Unit Test Expectations

Tests should cover both:

- Successful behavior.
- Failure behavior.

Avoid tests that only verify the happy path.

Every test file covering:

- Transition guards.
- Idempotency services.

must include at least one case expecting an exception.

---

# Example: Transition Guard Tests

```ts
describe('TransitionGuard', () => {
  it('allows accepted -> in_progress', () => {
    expect(() =>
      guard.assertValid('accepted', 'in_progress'),
    ).not.toThrow();
  });

  it('rejects completed -> accepted', () => {
    expect(() =>
      guard.assertValid('completed', 'accepted'),
    ).toThrow(InvalidTransitionException);
  });
});
```

---

# Test Quality Rules

Prefer tests that verify:

- Observable behavior.
- Business requirements.
- Database guarantees.
- API contracts.

Avoid:

- Testing private methods directly.
- Mocking away critical infrastructure behavior.
- Writing tests that encode existing bugs.

If the implementation conflicts with the specification, fix the implementation rather than changing the expected behavior.