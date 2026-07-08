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
- [ ] `docker compose up -d` for Postgres — Claude Code runs this as
      part of Phase 2 scaffolding, not a separate manual step

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
- [ ] Generate the `health` module skeleton the same way
- [ ] Confirm `.gitignore` excludes `.env`, `node_modules`, `dist`
- [ ] `docker-compose.yml` — Postgres service, correct port, named volume
- [ ] `.env.example` committed; real `.env` not committed;
      `FRONTEND_ORIGIN=http://localhost:5173` set so the harness's CORS
      requirement is satisfied by default, not an afterthought
- [ ] `npm run start:dev` boots cleanly with no leftover default route
      responding on `/` — confirms the boilerplate removal actually took

## Phase 3 — Data layer

- [ ] `Order` entity (six-value `status` enum, including `cancelled`) +
      `OrderStatusAudit` entity
- [ ] First migration: create both tables, both indexes:
      `idx_orders_idempotency_key` unique on `(partner_id, idempotency_key)`
      — composite, not single-column, per SPEC.md §2 idempotency-key-scope
      resolution — and `idx_orders_partner_status`
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