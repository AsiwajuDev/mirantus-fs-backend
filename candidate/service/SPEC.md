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
| `patientReference` | string | pseudonymous identifier only, never a real name/MRN; max 255 chars |
| `requestedLocation` | string | required, free text (e.g. facility name); max 255 chars |
| `priority` | enum: `routine` \| `urgent` | required |
| `status` | enum: `received` \| `accepted` \| `in_progress` \| `completed` \| `rejected` \| `cancelled` | defaults to `received` on creation |
| `idempotencyKey` | uuid | required on creation; unique **per partner** — the constraint is composite on `(partnerId, idempotencyKey)`, not global (see below) |
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

### Idempotency key scope

The unique constraint on `idempotencyKey` is scoped **per partner**
(`UNIQUE (partner_id, idempotency_key)`), not global. This was flagged
during spec review: a global constraint would mean two unrelated
partners who happen to submit the same UUID as their idempotency key
would collide, and the second partner's request would silently receive
the first partner's order back — a cross-tenant data disclosure. Scoping
the constraint per partner (the same approach used by Stripe and similar
idempotency-key APIs) makes that collision structurally impossible
rather than merely unlikely.

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

This includes **self-transitions** (e.g. `accepted → accepted`): no
state has itself listed as a valid next state, so re-submitting the
current status via `PATCH /orders/:id/status` is a `409`, not a no-op
`200`. This is a status *transition* endpoint, not an idempotent replay
mechanism — idempotency is handled separately, at creation, via
`Idempotency-Key` (§4).

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

- New `Idempotency-Key` (for that `partnerId`) → insert with
  `status: received`, write the audit row (`previousStatus: null`,
  `changedBy: partnerId` from the request body), return `201` with the
  full order.
- Same `Idempotency-Key`, same `partnerId`, replayed → return the
  **current state** of the original row (not a snapshot of its state at
  creation time — if it has since transitioned, the replay reflects
  that) as `201` (not a new row, not a `409`), matched by the unique DB
  constraint, not an application-level lookup-then-insert (see
  `database-conventions`).
- Same `Idempotency-Key`, same `partnerId`, different body → idempotency
  keys are keyed on the header (scoped per partner) alone, not the body.
  Return the original order as `201` (same status code as any other
  replay) and emit a structured warning log describing the mismatch.
- Same `Idempotency-Key`, **different** `partnerId` → no collision by
  construction, since the constraint is `(partnerId, idempotencyKey)`
  (see §2). Each partner has an independent key space; this is simply a
  new insert for that partner.
- Missing `Idempotency-Key` header → `400`.
- Present but malformed (non-UUID) `Idempotency-Key` → `400`.
- Missing or invalid required field → `400`, with a message identifying
  the offending field.

**Response body** (`201`, also the shape returned by `GET /orders/:id`
and `PATCH /orders/:id/status`):

```json
{
  "id": "b3f1c2e4-...",
  "partnerId": "b3f1...uuid",
  "patientReference": "PT-2026-00417",
  "requestedLocation": "Lagos Diagnostics, Ikeja",
  "priority": "routine",
  "status": "received",
  "createdAt": "2026-07-08T10:00:00.000Z",
  "updatedAt": "2026-07-08T10:00:00.000Z"
}
```

`idempotencyKey` is **not** included in the response — it is a
replay-detection mechanism for the client that already holds it, not
data the API needs to echo back, and the response interceptor (per
`validation-and-guards`) strips it along with any other
internal-only fields before the response leaves the process.

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
- `page` non-integer, zero, or negative → `400`
- `pageSize` non-integer, zero, or negative → `400`
- `pageSize > 100` → clamp to `100` (this is the one out-of-range case
  that clamps instead of rejecting, since an over-large request is
  harmless to cap; every other invalid value above is a `400`)
- No orders match the filters → `200` with `data: []`, `total: 0`, and
  the requested `page`/`pageSize` echoed back (not an error)

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

- Valid transition → `200`, body shaped per the response example in §4
  (`POST /orders`); audit row written in the same transaction
  (`changedBy: "system"` — the request body carries no partner
  identity, and authentication is out of scope, §8).
- Invalid transition → `409`; response includes both `from` and `to`
  states (see §5 for the exact shape).
- Unknown order → `404`.
- Invalid or missing status → `400`.

**Validation order when multiple failures apply** (e.g. an unknown order
id *and* an invalid `status` value in the same request): body validation
(the DTO pipe) runs before the order is looked up, so `400` wins over
`404` whenever both would otherwise apply.

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

Every endpoint returns errors with this base shape, shown here for an
unrelated `404` so it's clear this is the shared envelope and not
specific to any one exception type:

```json
{
  "statusCode": 404,
  "error": "OrderNotFoundException",
  "message": "Order 123 not found",
  "path": "/orders/123",
  "timestamp": "2026-07-07T10:00:00.000Z",
  "correlationId": "b6e2b5b0-...-uuid"
}
```

- `message` is always a **single string**, never an array — the global
  exception filter's `exceptionFactory` flattens NestJS's default
  per-constraint array (e.g. multiple failing `class-validator` rules)
  into one string before it reaches the client. This keeps the shape
  uniform regardless of how many validation rules failed.
- `correlationId` echoes the request correlation id generated by the
  logging middleware (§6/§7), so a client-reported error can be matched
  to server-side logs.

`InvalidTransitionException` (409, from `PATCH /orders/:id/status`)
extends the base shape with two additional fields, since the transition
endpoint's contract (§4) requires both states to be programmatically
inspectable, not just embedded in the message text:

```json
{
  "statusCode": 409,
  "error": "InvalidTransitionException",
  "message": "Cannot transition from completed to accepted",
  "path": "/orders/123/status",
  "timestamp": "2026-07-07T10:00:00.000Z",
  "correlationId": "b6e2b5b0-...-uuid",
  "from": "completed",
  "to": "accepted"
}
```

Every other exception type uses the base shape unmodified.

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
- **Logging:** structured logs with a request correlation ID.
  `patientReference` is never logged, full stop — not in any log
  statement, at any log level, regardless of what other context is or
  isn't present alongside it.
- **Security:** `helmet()` enabled; CORS restricted to
  `FRONTEND_ORIGIN`; rate limiting applied to mutating endpoints
  (`POST /orders`, `PATCH /orders/:id/status`) at **20 requests/minute
  per IP** — a starting default appropriate for this exercise's scale,
  adjustable via config without a spec change; ValidationPipe configured
  with `whitelist`, `forbidNonWhitelisted`, and `transform`.
- **Performance:** composite unique index on `(partnerId, idempotencyKey)`
  (§2); composite index on `(partnerId, status)`; bounded pagination;
  configurable TypeORM connection pool.

## 8. Out of scope

- Authentication and authorization.
- Request-body equality enforcement during idempotency replay.
- Keyset pagination.
- Cancellation side effects (notifications, billing reversals, refunds).
- Metrics endpoint.
- Multi-region or highly available PostgreSQL deployments.
- An audit-trail read endpoint (e.g. `GET /orders/:id/audit`). The
  `OrderStatusAudit` table exists for internal state reconstruction and
  investigation, not as a client-facing resource for this exercise.

## 9. Known limitation: `cancelled` and the frontend harness

The provided frontend was built against the original five-status
contract, so its transition controls, and its `GET /orders` **status
filter dropdown**, may not expose `cancelled` as a selectable option
(`provided/frontend/src/types.ts` types `OrderStatus` with five values).

Consequently:

- The API fully supports `cancelled` transitions and filtering.
- Automated integration tests verify this behavior.
- Manual verification can be performed using either `curl` or the
  generated Swagger UI (`/api-docs`) if the frontend cannot issue the
  transition or select the filter.
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

### `@spec-critic` pass (Phase 1)

18 findings were raised against the original draft. All were resolved
directly in this document rather than deferred, except where noted:

- **Idempotency key scope** (blocking): the original draft modeled a
  single global unique constraint on `idempotencyKey`, which would let
  two different partners' orders collide and leak across tenants on a
  key collision. Resolved by scoping the constraint to
  `(partnerId, idempotencyKey)` — see §2 and §4.
- **409 error shape inconsistency** (blocking): §4 required `from`/`to`
  as response fields, but §5's example only embedded them in the message
  string, and the `error-handling` skill's own example matched the
  under-specified version. Resolved by extending the base error shape
  for `InvalidTransitionException` specifically (§5), and updating the
  `error-handling` skill's example to match so the two don't drift back
  out of sync.
- **Missing response body shape** (blocking): no field-level example
  existed for what `POST`/`GET`/`PATCH` return. Added to §4, and decided
  `idempotencyKey` is stripped from responses (internal replay-detection
  data, not client-facing).
- **`changedBy` on `PATCH`**: resolved as `"system"`, since the request
  body carries no partner identity and auth is out of scope (§8).
- Remaining findings (pagination edge cases, self-transition semantics,
  malformed-UUID handling, field max-lengths, validation precedence,
  empty-result shape, bright-line PII logging rule, concrete rate limit,
  audit-endpoint scope note, `cancelled` filter limitation,
  different-body-replay status code, validation-error `message` type,
  `correlationId` in the error shape, and "original order" meaning
  current state rather than a creation-time snapshot) were all editorial
  clarifications with a single defensible resolution — folded directly
  into §2–§9 above rather than listed separately here. That's 4 named
  above plus these 14, accounting for all 18 raised findings.
- **Deferred, not fixed:** none. Every flagged gap had either an
  unambiguous resolution or, for the one genuine design decision
  (idempotency key scope), a decision made and recorded above.

### Phase 9 — end-to-end harness verification

Both servers were run locally (backend on `:3000` against the real
`service-postgres-1` container, frontend dev server on `:5173` via
`provided/frontend`'s own `npm run dev`, `.env` copied from
`.env.example` unmodified — `VITE_API_BASE_URL=http://localhost:3000`
matches the backend's default and the backend's `FRONTEND_ORIGIN`
matches `:5173`, so no CORS mismatch was introduced by this pass).

**Verification method note:** this pass was done at the HTTP/API level
(`curl` against the running backend), not by driving the harness UI in
a real browser — no browser-automation tool is available in this
environment. Every scenario Phase 9's checklist names was reproduced at
the API level the harness itself would call; the literal
visual/interactive confirmation (does the table render six columns, does
the error banner show readable text, does the "reuse last key" checkbox
work in the actual form) is left for a human to confirm directly in a
browser at `http://localhost:5173` — not claimed here without having
been observed.

Findings, all via direct API calls mirroring what the harness's own
`fetch` calls would send (`Origin: http://localhost:5173` on every
request):

- **CORS preflight** (`OPTIONS /orders` with
  `Access-Control-Request-Headers: content-type,idempotency-key`):
  `204`, `Access-Control-Allow-Origin: http://localhost:5173`,
  `Access-Control-Allow-Headers` echoes the requested headers back.
  The harness would not see a CORS failure or a "couldn't reach the
  service" banner from this backend as configured.
- **`POST /orders`**: `201`, response carries all six fields the
  harness table expects (`id`, `partnerId`, `patientReference`,
  `requestedLocation`, `priority`, `status`) plus `createdAt`/`updatedAt`,
  and correctly excludes `idempotencyKey`.
- **Idempotency replay** (same `Idempotency-Key`, identical body, two
  requests): both responses return the identical `id` — the "reuse last
  key" toggle's underlying behavior confirmed at the row level, not just
  that the UI doesn't visibly duplicate a row.
- **Invalid transition** (`received → completed`, skipping
  `accepted`/`in_progress`): `409`, body includes `from`, `to`,
  `correlationId`, and a readable `message` — exactly the shape the
  harness's debug panel is expected to display.
- **`accepted → cancelled`**: confirmed reachable and correct via direct
  `PATCH` calls (`received → accepted → cancelled`, final `status:
  "cancelled"` in the response). Per §9, the harness UI's transition
  control is expected not to expose `cancelled` as a selectable option
  at all (it was built against the five-status contract) — this was not
  re-confirmed visually in this pass, but is a pre-existing, already-
  documented limitation, not a new finding.
- **Filters**: `GET /orders?partnerId=<id>` returned only that partner's
  orders; `GET /orders?status=cancelled&partnerId=<id>` returned only
  the matching row. Per §9, the harness's status filter dropdown may not
  offer `cancelled` as an option — same pre-existing limitation, not
  re-confirmed visually here.
- **Pagination**: `GET /orders?pageSize=1&page=1` and `...&page=2`
  returned different orders with a consistent `total` across both calls
  and no overlap — confirms the `createdAt DESC` ordering (added in
  Phase 5 specifically so offset pagination is deterministic) actually
  holds under a real repeated query, not just in theory.

No implementation divergences from this specification were found during
this pass. Both dev servers were left running for the user's own visual
confirmation pass.
