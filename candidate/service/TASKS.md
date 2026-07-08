# TASKS.md

Each task is independently committable and (mostly) independently
verifiable. Check items off as they land; if a task expands beyond what's
listed here, stop and flag it rather than silently absorbing the extra
scope (per the working agreement in root `CLAUDE.md`).

## Phase 0 — Workflow setup

- [x] `.claude/` configured — CLAUDE.md, skills, subagents, hooks, MCP
      (see AI_USAGE.md for the reasoning behind each)
- [x] `chmod +x .claude/hooks/*.sh` — Claude Code runs this itself on
      first session, once, with one approval prompt
- [x] `docker compose up -d` for Postgres — landed in Phase 3 rather
      than Phase 2 scaffolding, once the Docker daemon (OrbStack) was
      actually running. `docker compose ps` shows `service-postgres-1`
      healthy; `psql -U postgres -d orders -c "select 1;"` confirmed
      connectivity matching `.env.local`'s `DATABASE_URL`.

## Phase 1 — Spec & planning

- [x] Draft `SPEC.md`, including the `cancelled` state addition and its
      explicit deviation-from-brief flag, the logging-vs-metrics
      reasoning, and the harness compatibility note for `cancelled`
- [x] Run `@spec-critic` against `SPEC.md`; resolve or explicitly defer
      every flagged gap
- [x] This file (`TASKS.md`) reflects the resolved spec

## Phase 2 — Scaffold

- [x] `nest new` into `candidate/service/`
- [x] Install core deps: `@nestjs/typeorm`, `typeorm`, `pg`,
      `@nestjs/config`, `class-validator`, `class-transformer`, `helmet`,
      `@nestjs/throttler`, `@nestjs/swagger`
- [x] Remove default boilerplate: `src/app.controller.ts`,
      `src/app.controller.spec.ts`, `src/app.service.ts`, and their
      registration in `app.module.ts` — none of it belongs in the final
      service. **Scope note:** `test/app.e2e-spec.ts` was also deleted
      even though not named here — it asserted `GET /` → `200 "Hello
      World!"`, exactly the behavior this task removes, and the next
      task below requires confirming no default route survives. Leaving
      it would just be a guaranteed-failing test for dead code.
      Unit tests are intentionally at zero (`npm run test` → "No tests
      found") until the next task generates fresh `orders`/`health`
      spec files.
- [x] Generate the `orders` module skeleton:
      `nest g module orders && nest g controller orders && nest g service orders`
      — per `nestjs-architecture` skill, everything for this feature
      lives inside `src/orders/`, not scattered at the top of `src/`.
      **Scope note (pre-cleared with the user before proceeding, not a
      unilateral decision):** the generator co-locates `*.spec.ts` next
      to the source by default; relocated both to `test/unit/orders/`
      and reconfigured `package.json`'s jest block (`rootDir` `.`,
      `roots: ["<rootDir>/test/unit"]`, `collectCoverageFrom:
      ["src/**/*.(t|j)s"]`, `coverageDirectory: "coverage"`) to match,
      per `CLAUDE.md`'s "Tests: `test/unit/` mirrors `src/`" convention
      and the `testing-standards` skill. `roots` intentionally excludes
      `src/` itself — specs reach source via relative imports, not Jest's
      haste resolution, so this isn't an oversight to "fix" by adding
      `src` back. `test/jest-e2e.json` (the separate `test:e2e` config)
      is untouched and unaffected. Same relocation will be needed for
      every future `nest g` module.
- [x] Generate the `health` module skeleton the same way — same
      spec-relocation to `test/unit/health/` applied (no further jest
      config changes needed; `roots`/`rootDir` from the orders task
      already cover `test/unit/health/` too)
- [x] Confirm `.gitignore` excludes `.env`, `node_modules`, `dist` —
      all three verified via `git check-ignore -v` against the root
      `.gitignore` (no separate `candidate/service/.gitignore` exists
      or is needed); no file changes required for this task
- [x] `docker-compose.yml` — Postgres service, correct port, named volume.
      `postgres:16-alpine`, port bound to `127.0.0.1:5432` (loopback
      only, per `@code-reviewer` hardening suggestion), named volume
      `orders_postgres_data`, matches `.env.local`'s `DATABASE_URL`
      (user/pass `postgres`, db `orders`), healthcheck
      `pg_isready -U postgres -d orders`. Validated on this machine via
      `docker compose config` only, since the Docker daemon wasn't
      running on this machine at the time. **Now verified end-to-end
      on this machine too:** once OrbStack was started (Phase 3), ran
      `docker compose up -d` — `service-postgres-1` reports healthy and
      `psql -U postgres -d orders -c "select 1;"` connects successfully
      with the exact `.env.local` credentials. `@code-reviewer` had
      already independently confirmed the same in its own sandbox
      earlier; this closes the loop on this machine specifically.
- [x] `.env.example` committed; real `.env` not committed;
      `FRONTEND_ORIGIN=http://localhost:5173` set so the harness's CORS
      requirement is satisfied by default, not an afterthought.
      Also set a working `DATABASE_URL` default matching
      `docker-compose.yml`'s credentials (not explicitly asked for in
      this bullet, but the natural extension of "set a working default,
      not an afterthought" now that the compose file exists) — `.env`/
      `.env.local` confirmed still gitignored, not committed.
- [x] `npm run start:dev` boots cleanly with no leftover default route
      responding on `/` — confirms the boilerplate removal actually took.
      Verified: server started clean (0 compile errors, `OrdersModule`/
      `HealthModule` both initialized, routes `{/orders}`/`{/health}`
      registered), `curl GET /` → `404` (no default route survives).
      `GET /health` → `404` too, but that's expected: `HealthController`
      is still an empty generated scaffold with no handlers yet — the
      actual `GET /health` implementation is Phase 6's job, not this
      one's.

## Phase 3 — Data layer

- [x] `Order` entity (six-value `status` enum, including `cancelled`) +
      `OrderStatusAudit` entity. `src/orders/order-status.enum.ts` and
      `priority.enum.ts` export a `const [...] as const` array plus a
      derived union `type` (not a TS `enum` keyword) per
      `typescript-style`'s "type for unions" convention; the array is
      the single source of truth also used by the entity's `enum:`
      column option, and will be imported by Phase 4's transition table
      and Phase 5's DTOs rather than redefined. **Deviation note:**
      `typescript-style` says use `interface` for entities, but TypeORM
      decorators (`@Entity`, `@Column`, etc.) only work on classes —
      both entities are classes, a technical requirement, not a style
      choice. `OrderStatusAudit.previousStatus`/`newStatus` are typed
      `string`/`string | null` per `SPEC.md` §2, not the `OrderStatus`
      union, so historical audit rows stay valid even if the status set
      changes later. Not yet registered in `OrdersModule` via
      `TypeOrmModule.forFeature()` — that needs `forRoot()` wired first,
      which is the next task. No index added on `OrderStatusAudit.orderId`
      beyond the two indexes SPEC.md/TASKS.md name for the `orders`
      table — not asked for, not added speculatively; a code comment on
      that column flags that its `REFERENCES orders(id)` FK constraint
      must be added at the DB level in the migration, since there's no
      `@ManyToOne` relation to generate it implicitly. Per
      `@code-reviewer`: both enum columns now set an explicit `enumName`
      (`orders_priority_enum`/`orders_status_enum`) so the migration's
      `CREATE TYPE` has an intentional name rather than an implicit one
      to reverse-engineer; `OrderStatusAudit`'s string columns use
      `text` (matching `logging-and-audit`'s schema table) instead of
      unbounded `varchar`.
- [x] First migration: create both tables, both indexes:
      `idx_orders_idempotency_key` unique on `(partner_id, idempotency_key)`
      — composite, not single-column, per SPEC.md §2 idempotency-key-scope
      resolution — and `idx_orders_partner_status`.
      `database/migrations/1783512134007-CreateOrdersAndAuditTables.ts`,
      hand-written per `database-conventions` (raw SQL via
      `QueryRunner.query`, not CLI-generated), creates both custom enum
      types (`orders_priority_enum`/`orders_status_enum`, matching the
      entity's `enumName`s), both tables, both indexes, and the
      `order_status_audit.order_id → orders.id` FK with `ON DELETE
      CASCADE` (an audit row only outlives its order in the sense of
      recording history while the order exists; there's no order-delete
      endpoint in SPEC.md at all, so this path is never actually
      exercised — CASCADE was picked as the harmless default over
      RESTRICT for that reason). **Verified against the live
      `service-postgres-1` container** (can't use `npm run
      migration:run` yet — `database/data-source.ts` and the npm
      scripts are the next task) by running the migration's exact SQL
      by hand via `psql`: schema matches (`\d orders`, `\d
      order_status_audit`, `\di`); same-partner-same-key insert
      correctly rejected with a unique-violation on
      `idx_orders_idempotency_key`; different-partner-same-key insert
      correctly succeeds as two independent rows — the actual
      cross-tenant collision this constraint exists to prevent (SPEC.md
      §2), confirmed structurally impossible, not just documented;
      audit-row insert and `ON DELETE CASCADE` both behave correctly.
      Ran the migration's `down()` SQL afterward to fully revert — DB
      confirmed empty (`\dt`/`\dT`) — so the next task's real
      `migration:run` starts clean instead of hitting "relation already
      exists" from this manual test. Per `@code-reviewer`: the `CASCADE`
      rationale is now also a comment in the migration file itself, not
      only here. **Follow-up, not done now:** no index on
      `order_status_audit.order_id` — not required by SPEC.md/
      `database-conventions` today, but likely needed once any
      investigation/reporting query pattern against the audit table
      emerges (SPEC.md §8 calls it out for "internal state
      reconstruction and investigation"). Add one in a later migration
      if/when that need shows up, rather than now.
- [ ] `database/data-source.ts` wired to env config
- [ ] `@db-reviewer` run against the migrated local DB to confirm indexes
      exist as expected

## Phase 4 — Core domain logic

- [ ] `order-status.enum.ts` + the valid-transitions table (as data, per
      `nestjs-architecture` skill) — six states including `cancelled`,
      matching SPEC.md §3 exactly
- [ ] `TransitionGuard` + unit tests (100% coverage target) — every
      valid transition including both `cancelled` paths (from `accepted`
      and from `in_progress`), plus at least one invalid transition per
      state
- [ ] Idempotent-insert logic on the repository layer:
      insert, catch unique-violation, return existing
      + unit tests covering the concurrent-replay case, including the
      different-body-same-key case from SPEC.md §4, **and** the
      cross-tenant case from SPEC.md §2/§4: two different `partnerId`s
      submitting the identical `Idempotency-Key` value must each get
      their own independently-created order, with no leakage of one
      partner's order to the other (this is the scenario the composite
      `(partnerId, idempotencyKey)` unique constraint exists to prevent)
- [ ] Status-update service method wraps the order update and audit insert
      in a single DB transaction (SPEC.md §2/§4); add a unit or integration
      test that forces a failure mid-update (e.g. a bad audit insert) and
      asserts the order's status change is rolled back too, not just
      committed with a missing audit row

## Phase 5 — Endpoints

- [ ] `CreateOrderDto`, `UpdateOrderStatusDto`, `QueryOrdersDto`, fully
      validated and annotated with `@ApiProperty`
- [ ] `POST /orders`
- [ ] `GET /orders` — response uses `data` as the array field per SPEC.md
      §4, with `page`/`pageSize`/`total` metadata
- [ ] `GET /orders/:id`
- [ ] `PATCH /orders/:id/status`
- [ ] Global exception filter, custom exception classes:
      `OrderNotFoundException`, `InvalidTransitionException`,
      409 body includes `from`/`to` fields per SPEC.md §5
- [ ] `@code-reviewer` run on this diff before commit

## Phase 6 — Cross-cutting

- [ ] `GET /health`, `GET /ready`
- [ ] Structured logging + request correlation id middleware
      (the chosen instrumentation approach per SPEC.md §6)
- [ ] `helmet()`, CORS restricted to `FRONTEND_ORIGIN`,
      `@nestjs/throttler` on mutating endpoints
- [ ] `@nestjs/swagger` wired up in `main.ts`; confirm `/api-docs` renders
      correctly and reflects actual validation rules, including the
      `cancelled` status value
- [ ] Startup env validation (fail fast on missing required var)
- [ ] `@security-auditor` run against the full checklist

## Phase 7 — Tests

- [ ] `@test-writer` invoked for unit test gaps
- [ ] Integration test: full `POST → GET → PATCH` flow against real
      Postgres container
- [ ] Integration test: idempotency replay, asserted via row count,
      not just HTTP response
- [ ] Integration test: cross-tenant idempotency key collision (same
      `Idempotency-Key` value, two different `partnerId`s) creates two
      separate orders, asserted via row count — confirms the composite
      `(partnerId, idempotencyKey)` unique constraint actually prevents
      the cross-tenant leak described in SPEC.md §2
- [ ] Integration test: audit row written on every status change,
      including both `cancelled` paths
- [ ] Integration test:
      `accepted → rejected` and `in_progress → rejected`
      both correctly return `409`
      (confirms the tightened `rejected` reachability from SPEC.md §3 is
      enforced, not just documented)

## Phase 8 — CI & infra

- [ ] `.github/workflows/ci.yml` — install, lint, build, test,
      Postgres as a service container
- [ ] Confirm CI passes on a clean checkout (not just locally)
- [ ] Terraform module: container service + managed Postgres (plan-only)
- [ ] `terraform validate` / `terraform plan` runs clean

## Phase 9 — End-to-end harness verification

- [ ] `cd provided/frontend && cp .env.example .env && npm install && npm run dev`
- [ ] With the service running on `:3000`, confirm the harness loads
      without the "couldn't reach the service" banner
- [ ] Create an order via the harness form; confirm it appears in the
      table with all six required fields:
      id, partnerId, patientReference, requestedLocation, priority,
      status
- [ ] Toggle "reuse last key" on, submit twice; confirm no duplicate row
      appears, this is the idempotency check happening manually, not
      just in the automated test
- [ ] Attempt an invalid transition via the per-row control; confirm the
      harness's error banner and debug panel show a readable 409 body
- [ ] Attempt to trigger `accepted → cancelled` via the harness UI;
      if unavailable (per SPEC.md §9), verify manually via `curl` or
      `/api-docs` instead and note the workaround in SPEC.md §12
- [ ] Test the `status`/`partnerId` filters and Prev/Next pagination
      controls against the real list endpoint
- [ ] Note anything the manual pass surfaced in SPEC.md §12

## Phase 10 — Documentation & close-out

- [ ] `README.md` — someone should be able to `docker compose up`,
      migrate, hit the API, and run tests from these instructions alone
- [ ] `SPEC.md` §12 self-review notes filled in
- [ ] `AI_USAGE.md` written
- [ ] Full pass:
      does everything in this file have a ✅, or an explicit note on why
      it was deferred?
