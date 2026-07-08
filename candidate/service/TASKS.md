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
- [x] `database/data-source.ts` wired to env config. Standalone CLI
      config (runs outside the Nest DI container, so it can't use
      `@nestjs/config`) reads `DATABASE_URL` (fails fast if missing — a
      real `exactOptionalPropertyTypes` compile error forced this
      rather than a type-cast) and `DB_POOL_SIZE` (defaults to `10`).
      Added `migration:run`/`migration:revert`/`migration:generate` npm
      scripts (`typeorm-ts-node-commonjs`). Both entities/audit table
      now import a shared `ORDER_ENTITIES` constant
      (`src/orders/entities/index.ts`) instead of each file listing
      `[Order, OrderStatusAudit]` separately, so a future new entity
      can't be added to one and forgotten in the other.
      **Correction, found by `@code-reviewer`:** my first verification
      pass ran `npm run migration:run`/`migration:revert` with
      `DATABASE_URL` manually exported inline in the shell command —
      that masked a real bug, since `data-source.ts` originally used
      bare `import 'dotenv/config'`, which only auto-loads a file
      literally named `.env`, and this project has no such file (only
      `.env.local`). The claim that this was "verified for real" was
      not reproducible from a clean shell using only the documented
      `.env.local` file, which is exactly what "wired to env config" is
      supposed to deliver. Fixed by loading `.env.local` explicitly
      (falling back to `.env` if absent), matching the same precedence
      already used in `AppModule`. **Re-verified without any manually
      exported env var** — `npm run migration:revert` then
      `migration:run` both worked purely off `.env.local`, confirmed
      with `env | grep DATABASE_URL` showing nothing beforehand.
      **Scope note (pre-cleared with the user before proceeding):** also
      wired `TypeOrmModule.forRootAsync()` into `AppModule` (via
      `ConfigModule`/`ConfigService`, `getOrThrow('DATABASE_URL')`,
      `inject: [ConfigService]` only — no `imports: [ConfigModule]`,
      since `ConfigModule.forRoot({ isGlobal: true })` already makes it
      available process-wide, and adding it again was redundant) and
      `TypeOrmModule.forFeature(ORDER_ENTITIES)` into `OrdersModule` —
      not its own TASKS.md line item, but Phase 4's repository-layer
      work needs a live runtime connection to exist, and it shares the
      same config as the CLI data source. Also hit and fixed the same
      `.env.local`-vs-`.env` bug on the `AppModule` side first (that's
      actually how the `data-source.ts` version of the bug was noticed
      afterward) — `envFilePath: ['.env.local', '.env']`. Added
      `DB_POOL_SIZE=10` to `.env.example` now that it's actually read.
      **Verified by actually starting the app** (`npm run start:dev`)
      against the live container, re-confirmed after the entities/env
      refactor: `TypeOrmCoreModule dependencies initialized` with no
      error, `Nest application successfully started`, `GET /orders`
      responds `404` (not connection-refused — confirms the server is
      genuinely up, `OrdersController` just has no handlers yet). Full
      env-validation fail-fast (Joi/class-validator, covering every
      required var) stays Phase 6's job, not this one's — only
      `DATABASE_URL` got a guard here, as a direct, unavoidable
      consequence of using it at all.
- [x] `@db-reviewer` run against the migrated local DB to confirm indexes
      exist as expected. **Substitution note:** the `postgres` MCP
      server wasn't actually connected in-session (`ListMcpResourcesTool`
      showed nothing named `postgres`). Root cause found and fixed
      separately (commit `561d836`): `.mcp.json` substituted
      `${DATABASE_URL}` from the parent shell, which this project never
      exports (kept in `.env.local` instead) — hardcoded the local dev
      connection string. That fix needs a Claude Code session restart
      to take effect, and there's no tool available mid-session to
      force an MCP reconnect. Rather than leave this task blocked, ran
      the same checks `@db-reviewer` would have, directly via `psql`
      against `service-postgres-1`: `\d orders`/`\d order_status_audit`
      confirm every column/type/nullability/default; `\di` shows
      exactly the 5 expected indexes and no stray ones (in particular,
      no accidental single-column unique index on `idempotency_key`
      alone, which would have silently reintroduced the cross-tenant
      collision the composite constraint exists to prevent);
      `pg_enum`/`pg_type` confirm both enum types have the exact
      values in the exact order; `pg_constraint` confirms the audit
      FK's `confdeltype = 'c'` (CASCADE); the `migrations` table
      correctly shows the one migration applied. If a real MCP-based
      `@db-reviewer` pass becomes possible later (after a restart),
      it can be re-run, but this isn't blocking Phase 3 on a harness
      limitation outside either of our control.

## Phase 4 — Core domain logic

- [x] `order-status.enum.ts` + the valid-transitions table (as data, per
      `nestjs-architecture` skill) — six states including `cancelled`,
      matching SPEC.md §3 exactly. `VALID_TRANSITIONS` added to the
      existing (Phase 3) `order-status.enum.ts` file rather than a new
      one, per this task's own phrasing. Terminal states (`completed`,
      `rejected`, `cancelled`) map to empty arrays; no state lists
      itself, so self-transitions fall through to the catch-all `409`
      per SPEC.md §3. Pure data — no `TransitionGuard` class or tests
      yet, that's the next task.
- [x] `TransitionGuard` + unit tests (100% coverage target) — every
      valid transition including both `cancelled` paths (from `accepted`
      and from `in_progress`), plus at least one invalid transition per
      state. `src/orders/transition-guard.ts`: a plain `@Injectable()`
      class with `assertValid(current, next)`, matching the
      `validation-and-guards` skill's example exactly — reads from the
      Phase 4 `VALID_TRANSITIONS` table rather than duplicating the
      rules. **Scope note (pre-cleared with the user before proceeding):**
      this task's literal wording doesn't mention exceptions, but
      `InvalidTransitionException` is what Phase 5 later lists — and
      `TransitionGuard` cannot throw anything meaningful without it. Added
      a minimal `src/orders/exceptions/invalid-transition.exception.ts`
      now (`ConflictException` subclass exposing `from`/`to` as public
      fields, matching SPEC.md §5's 409 body) so the guard isn't built
      against a throwaway stub. Phase 5 still owns wiring this into the
      global exception filter, `OrderNotFoundException`, and the rest of
      the response shape — this task only adds the one class the guard
      needs. **Correction, found by `@code-reviewer`:** the first version
      passed a plain string to `super()`, so `from`/`to` only existed as
      instance fields, not in `exception.getResponse()` — the exact
      mechanism the `error-handling` skill says the Phase 5 global filter
      must use, with no per-exception-type special casing. That would
      have silently dropped `from`/`to` from the real 409 response body.
      Fixed by passing `{ message, from, to }` to `super()` per the
      skill's own canonical example, keeping the instance fields too for
      direct typed access. Tests: `test/unit/orders/transition-guard.spec.ts`,
      all six valid transitions and one invalid transition per state
      (including all three terminal states), plus a dedicated case
      asserting the thrown exception's `from`/`to` fields, `.message`,
      and — per the same review finding — `getResponse()`'s shape
      directly, not just the instance fields. `npm run test --
      --coverage` confirms 100% stmt/branch/func/line coverage on both
      new files; full suite (5/5, 17 tests) green.
- [x] Idempotent-insert logic on the repository layer:
      insert, catch unique-violation, return existing
      + unit tests covering the concurrent-replay case, including the
      different-body-same-key case from SPEC.md §4, **and** the
      cross-tenant case from SPEC.md §2/§4: two different `partnerId`s
      submitting the identical `Idempotency-Key` value must each get
      their own independently-created order, with no leakage of one
      partner's order to the other (this is the scenario the composite
      `(partnerId, idempotencyKey)` unique constraint exists to prevent).
      `src/orders/orders.repository.ts`: `OrdersRepository.insertIdempotent`
      does an insert-first `repository.insert()`, catching `QueryFailedError`
      and checking the driver error's `code`/`constraint` (`23505` on
      `idx_orders_idempotency_key` specifically, not any unique violation)
      before falling back to `findOneByOrFail({ partnerId, idempotencyKey })`
      — per `database-conventions`, no SELECT-then-INSERT, no app-level
      locks. `CreateOrderInput` is `Pick<Order, ...>` rather than a
      hand-duplicated shape, so it can't silently drift from the entity.
      Registered `OrdersRepository` as an `OrdersModule` provider.
      **Scope note:** `@code-reviewer` flagged that the *previous* task's
      diff had silently also registered `TransitionGuard` (a leftover gap
      from that task) in this same commit-in-progress — split out into
      its own standalone commit (`5b170a1`) instead of folding it in here,
      per the one-task-per-commit working agreement.
      **Follow-up, not done now:** `@code-reviewer` also flagged that
      `insertIdempotent` has no way to participate in an externally
      supplied transaction/`EntityManager`, but SPEC.md §4 and
      `logging-and-audit` require the creation audit row to be written in
      the *same transaction* as the insert. This method's signature may
      need to change (e.g. accept an `EntityManager`) when Phase 4's next
      task (status-update transaction) or Phase 5's `POST /orders` wires
      the audit write in — not addressed here since this task's scope is
      the insert/catch/replay logic only, not the transaction it will
      eventually run inside.
      **Unit vs. integration boundary, intentional:** these are mocked
      unit tests exercising the repository's branching logic only (violation
      on the idempotency constraint → return existing; violation on any
      other constraint, or a non-DB error → rethrow unchanged; no violation
      → new row) — `test/unit/orders/orders.repository.spec.ts`, 6 cases:
      new insert, same-partner replay, different-body-same-key replay
      (asserts the returned row reflects the *existing* stored state, not
      the replay's body), cross-tenant (two partners, same key, both
      succeed independently, `findOneByOrFail` never called), an unrelated
      unique-violation constraint (rethrown, not swallowed), and a
      non-`QueryFailedError` (rethrown unchanged). This does not replace
      real-DB verification of the constraint itself — `testing-standards`
      explicitly warns that mocking repositories "hides database behavior
      critical to correctness, especially... unique constraint enforcement
      ... idempotency race handling" — that real-Postgres coverage is
      Phase 7's already-planned integration tests (idempotency replay and
      cross-tenant collision, both asserted via row count against the live
      container), not a gap introduced here.
      `npm run test -- --coverage` on the new file: 100% stmt/func/line;
      branch sits at 90% due to a single uncovered branch on the
      `@InjectRepository(Order)` constructor-parameter decorator's
      compiled `__param`/`__decorate` helper (confirmed via a standalone
      `tsc` repro of a bare decorated constructor param, unrelated to
      `@nestjs/typeorm`) — a `tsc` decorator-emit artifact, not application
      branch logic, and not something any additional test could reach.
      Full suite green: 6/6 suites, 23/23 tests.
- [x] Status-update service method wraps the order update and audit insert
      in a single DB transaction (SPEC.md §2/§4); add a unit or integration
      test that forces a failure mid-update (e.g. a bad audit insert) and
      asserts the order's status change is rolled back too, not just
      committed with a missing audit row.
      **Layering interpretation:** the transaction itself
      (`dataSource.transaction(...)`, `manager.getRepository(...).save`/
      `.insert`) lives in `OrdersRepository.applyStatusTransition` (new),
      not literally inside `orders.service.ts` — per `nestjs-architecture`
      ("services do not write raw SQL... database-specific operations
      remain in the data layer") and the `error-handling` skill's own
      canonical example, where the service calls `this.repo.applyTransition
      (order, next)` rather than opening the transaction itself.
      `OrdersService.updateStatus(order, next, changedBy)` (new) only
      calls `this.transitionGuard.assertValid(order.status, next)` then
      delegates. Both take an already-loaded `Order` entity, not an `id`
      — order lookup and `OrderNotFoundException` are Phase 5's job
      (the endpoint), same reasoning as the previous task's exception-vs-
      guard split. `updateStatus` also has no try/catch translating
      unexpected repository failures into a logged `InternalServerErrorException`
      (unlike `error-handling`'s fuller example) — deliberately deferred,
      since structured logging + a request-scoped logger is explicitly
      Phase 6's job, not this task's.
      Unit tests: `test/unit/orders/orders.repository.spec.ts` (new
      `applyStatusTransition` describe block, mocked `DataSource`/
      `EntityManager`) — asserts `manager.getRepository(Order).save` and
      `manager.getRepository(OrderStatusAudit).insert` are called with
      the correct data inside one `dataSource.transaction()` call, and
      that a rejection from the audit insert propagates rather than
      being swallowed. `test/unit/orders/orders.service.spec.ts`
      (rewritten from the generated stub) — valid transition delegates
      with the guard called first; an invalid transition (guard throws)
      never reaches the repository.
      **Real rollback, not just mocked propagation:** mocks can't prove
      atomicity — `dataSource.transaction()` on a mock manager doesn't
      have real rollback semantics to verify. Added
      `test/integration/orders-status-transition.e2e-spec.ts` against
      the live `service-postgres-1` container (via `database/data-source.ts`'s
      `dataSourceOptions`, no HTTP layer bootstrapped since none exists
      yet — Phase 5's job): one test confirms both the order update and
      audit row commit together; the other passes `changedBy: null`
      (bypassing the type system deliberately, test-only) to force a
      genuine Postgres `NOT NULL` violation on `order_status_audit
      .changed_by` mid-transaction, then re-queries the DB directly and
      confirms the order's status reverted to `received` and zero audit
      rows exist — the literal "bad audit insert" scenario this task
      names, verified against real Postgres, not a mock. `npm run
      test:e2e` (Postgres running): 1 suite, 2 tests, green; DB confirmed
      empty afterward (`afterEach` cleanup).
      **Known, pre-existing coverage-tool artifact (documented previously
      for `OrdersRepository`, now also seen on `OrdersService`):**
      `npm run test -- --coverage` shows `orders.repository.ts` at 100%
      stmt/func/line but 85.71% branch, and `orders.service.ts` at 100%
      stmt/func/line but 75% branch. In both cases the only uncovered
      branches are on each class's constructor parameter-property lines
      — confirmed (via a standalone `tsc --experimentalDecorators
      --emitDecoratorMetadata` repro of a bare `@Injectable()` class with
      plain constructor parameter properties, *no* per-parameter
      decorator needed) to be the compiled `__decorate`/parameter-property
      assignment ternary, not application logic. This will recur on
      every future NestJS provider with constructor-injected dependencies
      in this codebase — not a gap introduced by this task, and not
      something any additional test could close.

## Phase 5 — Endpoints

Done as one pass across all six boxes below, per explicit user instruction
to finish the whole phase before a single review + commit, rather than
the per-task checkpoint cadence used in Phases 1–4.

**Two gaps between this file's literal wording and what SPEC.md/root
CLAUDE.md actually require, both flagged and cleared with the user
before writing code (not decided unilaterally):**
1. Neither this phase nor Phase 6 has a line item for a response
   interceptor, but SPEC.md §4 explicitly names one as the mechanism
   that strips `idempotencyKey` from responses, and root CLAUDE.md lists
   response interceptors as non-negotiable. Built now (see below).
2. Nothing in either phase wires the global `ValidationPipe` into
   `main.ts`, but without it every DTO validation decorator in this
   phase is inert — invalid input would reach business logic instead of
   getting rejected with `400`. Wired now, alongside the exception
   filter this phase already lists explicitly.
Also cleared: SPEC.md §5's error shape examples include `correlationId`,
generated by Phase 6's not-yet-built request-correlation middleware.
Omitted from the filter for now rather than faked with a per-error
random UUID that wouldn't actually correlate to anything — Phase 6 adds
it for real.

- [x] `CreateOrderDto`, `UpdateOrderStatusDto`, `QueryOrdersDto`, fully
      validated and annotated with `@ApiProperty`.
      `src/orders/dto/{create-order,update-order-status,query-orders}.dto.ts`.
      `QueryOrdersDto.pageSize` has no `@Max` — SPEC.md §4 requires an
      over-large value to *clamp* to 100, not reject like every other
      out-of-range field on this DTO, so the clamp happens in
      `OrdersService.findAll`, not the DTO. `page`/`pageSize` use
      `@Type(() => Number)` (class-transformer) since query params
      arrive as strings; the global `ValidationPipe`'s `transform: true`
      (below) is what actually applies it.
- [x] `POST /orders`. `OrdersController.create` delegates to
      `OrdersService.createOrder`. The `Idempotency-Key` header can't be
      validated via a pipe the way `@Param`/`@Body` can — `@Headers()`
      doesn't accept pipes (confirmed: `TS2554` on the first attempt) —
      so `src/orders/decorators/idempotency-key.decorator.ts` is a small
      custom param decorator doing the same missing/malformed-UUID → 400
      check, with its factory function exported separately so it's unit
      testable without a real request per Nest's documented pattern for
      testing custom decorators.
      **Amends the Phase 4 idempotent-insert method** (`@code-reviewer`
      had already flagged this as a likely follow-up): `insertIdempotent`
      now wraps the audit-row insert into the *same* transaction as a
      genuinely new order's insert (`changedBy: partnerId`, per SPEC.md
      §4) — the replay/lookup path is unaffected. `OrdersService.createOrder`
      also implements the different-body-same-key warning log (SPEC.md
      §4) by comparing the replayed body's `patientReference`/
      `requestedLocation`/`priority` against the stored order's, logging
      via `logging-and-audit`'s documented `this.logger.warn(...)`
      pattern — the repository itself stays unaware of "body" as a
      concept, matching its existing (Phase 4) scope.
- [x] `GET /orders` — response uses `data` as the array field per SPEC.md
      §4, with `page`/`pageSize`/`total` metadata. `OrdersRepository.findMany`
      (new) builds an optional `status`/`partnerId` `where` and paginates
      via `findAndCount`; added an explicit `order: { createdAt: 'DESC' }`
      — not asked for verbatim, but `LIMIT`/`OFFSET` pagination is only
      deterministic across repeated queries with a defined sort, so this
      is a correctness requirement for pagination to behave at all, not
      an invented feature.
- [x] `GET /orders/:id`. `OrdersRepository.findById` + `OrdersService.getById`,
      throwing the new `OrderNotFoundException` (see below) when missing.
      Malformed-UUID → 400 via `ParseUUIDPipe` on the route param.
- [x] `PATCH /orders/:id/status`. `OrdersService.transitionStatus` looks
      up the order (404 if missing) then calls the existing (Phase 4)
      `updateStatus`. SPEC.md §4's "body validation wins over 404 when
      both would apply" falls out for free from Nest's own pipe-then-handler
      ordering: `UpdateOrderStatusDto`'s validation happens for every
      parameter before the handler body runs at all, so an invalid
      `status` value throws before the order lookup (which is what would
      produce the 404) ever executes — no extra ordering logic needed,
      confirmed by an integration test that hits both conditions at once.
- [x] Global exception filter, custom exception classes:
      `OrderNotFoundException`, `InvalidTransitionException`,
      409 body includes `from`/`to` fields per SPEC.md §5.
      `OrderNotFoundException` (new) mirrors the `error-handling` skill's
      example exactly. `InvalidTransitionException` already existed
      (Phase 4). `src/common/filters/http-exception.filter.ts` (`@Catch()`,
      no type filter — every error, `HttpException` or not, passes
      through, per root CLAUDE.md's non-negotiable): builds the base
      shape for any `HttpException`, adds `from`/`to` when the
      exception's `getResponse()` carries them, flattens a
      `class-validator`-style message array to one string as a defensive
      fallback (the primary flattening happens once, in the
      `ValidationPipe`'s own `exceptionFactory`, per SPEC.md §5 — not
      duplicated logic, just defense in depth), and maps anything that
      isn't an `HttpException` to a generic `500`/`"Internal server
      error"` without leaking the real error's message. `main.ts`'s
      wiring (`ValidationPipe`, this filter, `ResponseShapeInterceptor`)
      was pulled into `src/configure-app.ts` so the integration test
      bootstraps the exact same pipeline as the real running service,
      not a hand-rolled approximation of it.
      **Response interceptor** (the first flagged gap above):
      `src/common/interceptors/response-shape.interceptor.ts` — per the
      `validation-and-guards` skill's own named example, not Nest's
      built-in `ClassSerializerInterceptor` substituted in its place.
      Uses `class-transformer`'s `instanceToPlain`, and `Order.idempotencyKey`
      is now marked `@Exclude()`. Verified this strips the field both for
      a single `Order` response and for every `Order` nested inside the
      `GET /orders` paginated wrapper object (a plain object, not a class
      instance) — `class-transformer` walks nested class instances
      regardless of the containing object's own type, confirmed by a
      dedicated unit test, not just assumed.
      **Blocking bug, found by `@code-reviewer` and verified live against
      `service-postgres-1`:** `PATCH /orders/:id/status` leaked
      `idempotencyKey` in its response, in violation of SPEC.md §4 —
      `OrdersRepository.applyStatusTransition` (Phase 4) did
      `manager.getRepository(Order).save({ ...order, status: next })`;
      spreading an `Order` instance into a plain object literal drops
      its prototype, so the saved/returned object no longer carried
      `class-transformer`'s `@Exclude()` metadata, and
      `ResponseShapeInterceptor` had nothing to recognize. `POST`/`GET`
      were unaffected (they never go through this method) — only
      `PATCH` leaked. Fixed by mutating the loaded entity in place
      (`orderRepo.merge(order, { status: next })` then `save()`) instead
      of spreading, which fixing also surfaced a second latent bug in
      the same block: `previousStatus` was read from `order.status`
      *after* the merge would have mutated it in place, which would have
      silently written the *new* status as `previousStatus` in the audit
      row — fixed by capturing `previousStatus` before the merge.
      Neither the existing mocked unit test (`toEqual`, blind to
      prototype identity) nor the existing `PATCH` integration test
      (asserted only on `.status`) could have caught the leak — added a
      real-Postgres regression assertion
      (`test/integration/orders.e2e-spec.ts`) that the `PATCH` response
      has no `idempotencyKey`, and rewrote the `applyStatusTransition`
      unit test to use a real `Order` instance and assert `merge`/`save`
      are called correctly and the result is `instanceof Order`.
- [x] `@code-reviewer` run on this diff before commit.
      **Test coverage for the whole phase:** DTO validation specs (one
      per DTO, both accept/reject cases); the custom header decorator's
      factory function directly; `ResponseShapeInterceptor`; the
      exception filter (base shape, `from`/`to`, array-message
      flattening, a raw `HttpException` string body and object body with
      a non-string/non-array `message` — both real, reachable branches
      via `HttpException`'s public API, not speculative — and the
      non-`HttpException` fallback); `OrdersService`'s four new methods
      (including the body-mismatch warning log and the pageSize clamp);
      `OrdersController`'s four handlers (delegation only, per
      `nestjs-architecture`'s thin-controller rule). Every genuine branch
      gap surfaced by `npm run test -- --coverage` was closed with a real
      test; the only remaining sub-100% branch numbers (`orders.controller.ts`,
      `orders.service.ts`, `orders.repository.ts`, both entity files) are
      the same TypeScript decorator/parameter-property compilation
      artifact documented on two earlier tasks, now additionally
      confirmed to also affect property decorators (`@Column`,
      `@CreateDateColumn`) on entities, not only constructor parameters —
      not a real gap, and not newly introduced by this task.
      **Integration tests** (`test/integration/orders.e2e-spec.ts`, new):
      bootstraps the full `AppModule` + `configure-app.ts` pipeline
      against the live `service-postgres-1` container via `supertest`,
      one test per endpoint's basic contract (happy path, the
      idempotency replay row-count check, 400/404/409 cases) — per
      `testing-standards`' "Endpoint Coverage" requirement, which applies
      regardless of TASKS.md phase boundaries. Phase 7's own line items
      (idempotency row-count *and* cross-tenant, full audit-row
      assertions, `rejected`-reachability) are deliberately not
      duplicated here — this establishes the endpoints work at all;
      Phase 7 goes deeper. Also added: an empty-results case (SPEC.md §4:
      no matches is `200`/`total: 0`, not an error) and a
      `whitelist: true` rejection case for an unknown query param.
      `npm run test:e2e`: 2 suites (this one plus Phase 4's), 17 tests,
      green, against the real container — including the `PATCH` leak
      regression test above.
      Full unit suite: 12 suites, 70 tests, green, with no more incidental
      console noise (the `OrdersService` logger's `warn` calls are now
      mocked in its spec, per a `@code-reviewer` suggestion).
      `npm run build` and `npm run lint` both clean (the one remaining
      lint warning, an unawaited `bootstrap()` in `main.ts`, is the same
      pre-existing, unrelated warning flagged and deliberately left
      alone in an earlier task).

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
