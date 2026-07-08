# Service-local notes — candidate/service/CLAUDE.md

This extends the root `CLAUDE.md` — read that first for the full stack,
non-negotiables, subagents, and MCP setup. This file only holds detail
specific to working *inside* `candidate/service/`, so it stays short and
doesn't duplicate anything that would drift out of sync with the root
file.

## Run everything from this directory
```bash
cd candidate/service
npm run start:dev      # API on :3000
npm run test            # unit tests
npm run test:e2e        # integration tests — needs Postgres running
npm run migration:run
npm run postman:sync    # regenerates postman/openapi.json from /api-docs-json — only if running
```
Don't run npm commands from the repo root — there's no `package.json`
there. This is also why `.husky/commit-msg` at the repo root uses
`npx --prefix candidate/service commitlint` rather than assuming this
folder is where Git hooks fire from.

## Environment
`.env` here is gitignored; `.env.example` is committed and is the
template. Two values matter beyond the obvious `DATABASE_URL`:
- `FRONTEND_ORIGIN` — must match wherever `provided/frontend/` is
  running (`http://localhost:5173` by default) or CORS will silently
  block every harness request.
- `DB_POOL_SIZE` — small default (10) is intentional for this service's
  scale; see `database-conventions` skill before changing it.

## Status enum has six values, not five
`OrderStatus` includes `cancelled` in addition to the five in the
original brief — this is a deliberate, documented deviation (see
`SPEC.md` §3), not an oversight. If you're implementing or reviewing the
transition guard, check against `SPEC.md` §3's table directly rather
than the brief's prose description, which only lists five.

## The provided frontend harness won't exercise `cancelled`
`provided/frontend/` is fixed and not ours to modify. Its transition
control was built against the original five-status contract, so it may
not offer `cancelled` as a selectable option. That's expected — verify
`cancelled` transitions via `/api-docs` or `curl`, not by expecting the
harness UI to expose it. See `SPEC.md` §9.

## Audit writes are transactional, not best-effort
Every status-changing service method must write the `OrderStatusAudit`
row inside the same `DataSource` transaction as the order update itself
— never as a separate step afterward. See `logging-and-audit` skill for
the pattern, and `SPEC.md` §2/§4 for why this is non-negotiable.

## Where things live
- DTOs, entities, enums: inside their feature module under `src/`
  (`src/orders/`), not in project-wide folders — see
  `nestjs-architecture` skill.
- Migrations: `database/migrations/`, never in `src/`.
- Tests: `test/unit/` mirrors `src/`; `test/integration/` holds the
  real-Postgres end-to-end specs.

## Progress tracking
Check off the corresponding box in `candidate/TASKS.md` as each task
lands — that file is the actual source of truth for what's done, not
this one.