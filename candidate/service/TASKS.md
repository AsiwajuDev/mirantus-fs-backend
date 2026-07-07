# TASKS.md

Each task should be independently committable and, where possible, independently verifiable.

Check items off as work is completed.

If a task expands beyond what is listed here:

1. Stop.
2. Flag the scope expansion.
3. Do not silently absorb additional work.

Follow the working agreement defined in the root `CLAUDE.md`.

---

# Phase 0 — Workflow Setup

- [x] `.claude/` configured:
  - `CLAUDE.md`
  - skills
  - subagents
  - hooks
  - MCP configuration

See:

```text
AI_USAGE.md
```

for the reasoning behind these choices.

---

# Phase 1 — Specification & Planning

- [ ] Draft:

```text
SPEC.md
```

- [ ] Run:

```text
@spec-critic
```

against `SPEC.md`.

Requirements:

- Resolve every flagged gap.
- Or explicitly defer the issue with justification.

- [ ] Ensure this file (`TASKS.md`) reflects the resolved specification.

---

# Phase 2 — Scaffold

- [ ] Create NestJS application in:

```text
candidate/service/
```

using:

```text
nest new
```

- [ ] Install core dependencies:

```text
@nestjs/typeorm
typeorm
pg
@nestjs/config
class-validator
class-transformer
helmet
@nestjs/throttler
@nestjs/swagger
```

- [ ] Confirm `.gitignore` excludes:

```text
.env
node_modules
dist
```

- [ ] Add:

```text
docker-compose.yml
```

Requirements:

- PostgreSQL service.
- Correct port configuration.
- Named database volume.

- [ ] Commit:

```text
.env.example
```

- [ ] Confirm real `.env` files are not committed.

---

# Phase 3 — Data Layer

- [ ] Create entities:

```text
Order
OrderStatusAudit
```

- [ ] Create initial migration.

Requirements:

Create:

- Orders table.
- Audit table.

Add indexes:

```text
idx_orders_idempotency_key
```

Unique:

```text
idx_orders_partner_status
```

Composite:

```text
(partner_id, status)
```

- [ ] Configure:

```text
database/data-source.ts
```

using environment configuration.

- [ ] Run:

```text
@db-reviewer
```

against the migrated local database.

Confirm:

- Tables exist.
- Columns match expectations.
- Required indexes exist.

---

# Phase 4 — Core Domain Logic

- [ ] Create:

```text
order-status.enum.ts
```

- [ ] Implement valid transition table as data.

Follow:

```text
nestjs-architecture
```

requirements.

- [ ] Implement:

```text
TransitionGuard
```

(or equivalent service method).

Requirements:

- Single source of truth.
- No duplicated transition rules.

Testing:

- 100% coverage target.
- Every valid transition covered.
- At least one invalid transition per state covered.

- [ ] Implement idempotent insert logic.

Requirements:

Pattern:

```text
INSERT
→ catch unique violation
→ return existing record
```

Do not use:

```text
SELECT
→ INSERT
```

- [ ] Add unit tests covering concurrent replay behavior.

---

# Phase 5 — Endpoints

- [ ] Create DTOs:

```text
CreateOrderDto
UpdateOrderStatusDto
QueryOrdersDto
```

Requirements:

- Fully validated.
- Every field has validation decorators.
- Every field has Swagger metadata using `@ApiProperty`.

- [ ] Implement:

```text
POST /orders
```

- [ ] Implement:

```text
GET /orders
```

Requirements:

- Filtering.
- Pagination.
- Bounded page size.

- [ ] Implement:

```text
GET /orders/:id
```

- [ ] Implement:

```text
PATCH /orders/:id/status
```

- [ ] Add:

Global exception filter.

- [ ] Add custom exceptions:

```text
OrderNotFoundException
InvalidTransitionException
```

- [ ] Run:

```text
@code-reviewer
```

before committing this phase.

---

# Phase 6 — Cross-Cutting Concerns

- [ ] Add:

```text
GET /health
GET /ready
```

- [ ] Add structured logging.

Requirements:

- Structured log format.
- Request correlation ID middleware.
- Correlation ID propagated through logger context.

- [ ] Configure:

```text
helmet()
```

- [ ] Configure CORS.

Requirements:

- Restricted to:

```text
FRONTEND_ORIGIN
```

- No wildcard origin.

- [ ] Configure:

```text
@nestjs/throttler
```

Requirements:

- Protect mutating endpoints.
- Prefer global guard configuration.

- [ ] Configure Swagger.

Requirements:

- Wire:

```text
@nestjs/swagger
```

in `main.ts`.

- Confirm:

```text
/api-docs
```

renders correctly.

- Confirm generated documentation reflects DTO validation rules.

- [ ] Add startup environment validation.

Requirements:

- Fail fast on missing required variables.
- Validate before serving traffic.

- [ ] Run:

```text
@security-auditor
```

against the complete checklist.

---

# Phase 7 — Tests

- [ ] Run:

```text
@test-writer
```

for remaining unit test gaps.

- [ ] Add integration test:

```text
POST → GET → PATCH
```

against the real PostgreSQL container.

- [ ] Add integration test:

Idempotency replay.

Verify:

- Same key returns same order.
- Duplicate row is not created.
- Database row count is asserted directly.

- [ ] Add integration test:

Audit creation.

Verify:

- Audit row exists.
- Previous status recorded.
- New status recorded.

---

# Phase 8 — CI & Infrastructure

- [ ] Add:

```text
.github/workflows/ci.yml
```

Pipeline requirements:

- Install dependencies.
- Lint.
- Build.
- Run tests.
- Start PostgreSQL service container.

- [ ] Confirm CI passes on a clean checkout.

Do not rely only on local success.

- [ ] Add Terraform module.

Requirements:

- Container service.
- Managed PostgreSQL.

Scope:

```text
plan-only
```

- [ ] Run:

```bash
terraform validate
terraform plan
```

Confirm both complete successfully.

---

# Phase 9 — Documentation & Close-Out

- [ ] Update:

```text
README.md
```

A new developer must be able to:

1. Start PostgreSQL.
2. Run migrations.
3. Start the API.
4. Call endpoints.
5. Run tests.

using only the README instructions.

- [ ] Complete:

```text
SPEC.md §8 self-review notes
```

- [ ] Create:

```text
AI_USAGE.md
```

- [ ] Final verification:

Confirm every task is:

- ✅ Completed

or:

- Explicitly deferred with justification.