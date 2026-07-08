# SPEC.md — Screening Order Service

## 1. Overview

This service owns the order resource end-to-end: create,
list, fetch, and transition through a fixed status lifecycle. This
document is the source of truth for behavior, if code and this file
disagree, this file wins, and the disagreement should be flagged rather
than silently resolved either way.

The `provided/frontend/` harness exercises this API for manual end-to-end
sanity checks. It is not graded and not modified, see §11 for how it's
used in the workflow, and §9 for a known limitation around it.

## 2. Data model

### `Order`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, pk | generated |
| `partnerId` | uuid | required, identifies the submitting partner |
| `patientReference` | string | pseudonymous identifier only, never a real name/MRN |
| `requestedLocation` | string | required, free text (e.g. facility name) |
| `priority` | enum: `routine` \| `urgent` | required |
| `status` | enum: `received` \| `accepted` \| `in_progress` \| `completed` \| `rejected` \| `cancelled` | defaults to `received` on creation |
| `idempotencyKey` | uuid | required on creation, unique constraint |
| `createdAt` | timestamptz | set on insert |
| `updatedAt` | timestamptz | set on every update |

### `OrderStatusAudit`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, pk | generated |
| `orderId` | uuid, fk → orders.id | |
| `previousStatus` | string, nullable | null on the creation event |
| `newStatus` | string | |
| `changedBy` | string | partnerId, or `system` |
| `createdAt` | timestamptz | |

One row per state change, written in the same DB transaction as the
change itself, see `logging-and-audit` skill for why "same transaction"
is non-negotiable, not just a nice-to-have.

## 3. Status lifecycle

```text
received ───────► accepted ───────► in_progress ───────► completed
    │                 │                    │
    ▼                 ▼                    ▼
rejected         cancelled           cancelled
```

| From | Valid next states |
|---|---|
| `received` | `accepted`, `rejected` |
| `accepted` | `in_progress`, `cancelled` |
| `in_progress` | `completed`, `cancelled` |
| `completed` | *(terminal)* |
| `rejected` | *(terminal)* |
| `cancelled` | *(terminal)* |

**Interpretation note — deviation from the brief, flagged explicitly:**  
The case study specifies exactly five status values:
`received`, `accepted`, `in_progress`, `completed`, and `rejected`, with
`rejected` "reachable from the appropriate states" left to our judgment.
This specification intentionally introduces a sixth terminal state,
`cancelled`, because it models a materially different business event.

- **`rejected`** — the order was never accepted for processing. It is
  only valid from `received`.
- **`cancelled`** — the order had already been accepted (or was already
  in progress) but was later terminated. This distinction matters for
  downstream business processes such as billing, partner notification,
  analytics, and operational reporting.

This is a deliberate product interpretation rather than a correction to
the brief, and is documented here so reviewers can evaluate it as an
explicit design decision instead of discovering it as an undocumented
implementation change.

Any transition not listed in this table returns `409 Conflict`. The
transition table is defined once as shared data and imported by both the
`TransitionGuard` and its unit tests rather than duplicated.

## 4. Endpoints

### `POST /orders`

**Headers:** `Idempotency-Key: <uuid>` (required)

**Body:**

```json
{
  "partnerId": "b3f1...uuid",
  "patientReference": "PT-2026-00417",
  "requestedLocation": "Lagos Diagnostics, Ikeja",
  "priority": "routine"
}
```

**Behavior:**

- New `Idempotency-Key` → insert with `status: received`, write the audit
  row (`previousStatus: null`), return `201` with the full order.
- Same `Idempotency-Key` replayed → return the **original** order as
  `201` (not a new row, not a `409`), matched by the unique DB
  constraint, not an application-level lookup-then-insert (see
  `database-conventions`).
- Same `Idempotency-Key`, different body → idempotency keys are keyed on
  the header alone, not the body. Return the original order and emit a
  structured warning log describing the mismatch.
- Missing `Idempotency-Key` header → `400`.
- Missing or invalid required field → `400`, with a message identifying
  the offending field.

### `GET /orders`

**Query parameters:**

- `status` (optional, one of the six status values)
- `partnerId` (optional, UUID)
- `page` (optional, default `1`)
- `pageSize` (optional, default `20`, maximum `100`)

**Response:**

```json
{
  "data": [],
  "page": 1,
  "pageSize": 20,
  "total": 143
}
```

The frontend harness accepts `data`, `orders`, `items`, or `results` as
the array field. This specification standardizes on `data`.

Validation:

- Invalid `status` → `400`
- Invalid `partnerId` → `400`
- `pageSize > 100` → clamp to `100`

### `GET /orders/:id`

- Existing order → `200`
- Unknown UUID → `404`
- Malformed UUID → `400`

Although the frontend harness does not call this endpoint directly, it is
required by the exercise.

### `PATCH /orders/:id/status`

**Body:**

```json
{
  "status": "accepted"
}
```

Behavior:

- Valid transition → `200`; audit row written in the same transaction.
- Invalid transition → `409`; response includes both `from` and `to`
  states.
- Unknown order → `404`.
- Invalid or missing status → `400`.

### `GET /health`

Returns:

```json
{
  "status": "ok"
}
```

Pure liveness check. No database dependency.

### `GET /ready`

Performs a real database readiness check using:

```sql
SELECT 1;
```

Returns:

- `200` when the database is reachable.
- `503` otherwise.

### `GET /api-docs`

Generated OpenAPI documentation using `@nestjs/swagger`.

Because it is generated directly from DTOs and controller decorators, it
always reflects the implementation. It is also the recommended way to
exercise the `cancelled` transition if the provided frontend does not
expose that state.

## 5. Error shape

```json
{
  "statusCode": 409,
  "error": "InvalidTransitionException",
  "message": "Cannot transition from completed to accepted",
  "path": "/orders/123/status",
  "timestamp": "2026-07-07T10:00:00.000Z"
}
```

Every endpoint returns errors in this format.

## 6. Instrumentation

The brief permits either a metrics endpoint or structured logging.

This implementation chooses **structured logging with request correlation
IDs** because:

- At this scale, logs are sufficient to answer operational questions.
- The audit table already provides durable state history.
- Introducing Prometheus-compatible metrics without any monitoring
  infrastructure would add complexity without meaningful value.

Metrics are an obvious future enhancement once the service is deployed
into an environment that scrapes them.

## 7. Non-functional requirements

- **Configuration:** database connection, port, `FRONTEND_ORIGIN`, and
  pool size supplied via environment variables and validated during
  startup.
- **Logging:** structured logs with a request correlation ID. Never log
  `patientReference` alongside enough context to identify an individual.
- **Security:** `helmet()` enabled; CORS restricted to
  `FRONTEND_ORIGIN`; rate limiting applied to mutating endpoints;
  ValidationPipe configured with `whitelist`,
  `forbidNonWhitelisted`, and `transform`.
- **Performance:** unique index on `idempotencyKey`; composite index on
  `(partnerId, status)`; bounded pagination; configurable TypeORM
  connection pool.

## 8. Out of scope

- Authentication and authorization.
- Request-body equality enforcement during idempotency replay.
- Keyset pagination.
- Cancellation side effects (notifications, billing reversals, refunds).
- Metrics endpoint.
- Multi-region or highly available PostgreSQL deployments.

## 9. Known limitation: `cancelled` and the frontend harness

The provided frontend was built against the original five-status
contract, so its transition controls may not expose `cancelled`.

Consequently:

- The API fully supports `cancelled` transitions.
- Automated integration tests verify this behavior.
- Manual verification can be performed using either `curl` or the
  generated Swagger UI (`/api-docs`) if the frontend cannot issue the
  transition.
- This is an expected consequence of intentionally extending the
  original status model rather than a defect in either implementation.

## 10. Privacy & regulatory considerations

The service processes only pseudonymous identifiers.

`patientReference` is contractually required to avoid real patient
identifiers, although the application cannot technically enforce this.

A production deployment would additionally require:

- Encryption in transit.
- Encryption at rest.
- Database access auditing.
- Regulatory review (for example GDPR, healthcare regulations, and the
  Nigeria Data Protection Act where applicable).
- Defined data-retention policies.

These concerns are intentionally documented but remain outside the scope
of this exercise.

## 11. Using the provided frontend harness

The frontend in `provided/frontend/` is intended only for manual
end-to-end smoke testing.

Typical verification includes:

- Order creation.
- Idempotency replay.
- Status transitions.
- Error responses.

It complements—but does not replace—the automated integration test
suite. See §9 for the known limitation regarding the `cancelled`
transition.

## 12. Self-review notes

*(Completed after implementation.)*

- Where the implementation diverged from this specification, and why.
- Any transition or idempotency edge cases discovered during testing.
- Feedback from `@spec-critic` and how each finding was addressed.
- Findings from the manual frontend pass that were not already covered
  by automated tests, including whether the `cancelled` transition had
  to be exercised through `/api-docs`.
