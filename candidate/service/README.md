# Screening Order Service

A NestJS + TypeORM + PostgreSQL service implementing the order lifecycle
described in [`SPEC.md`](./SPEC.md). Built for the Mirantus take-home
case study; see the repo root [`README.md`](../../README.md) for the
overall exercise and [`../../CASE_STUDY.md`](../../CASE_STUDY.md) for
the original brief.

## Prerequisites

- Node.js 24 (matches CI and `@types/node`'s `^24`)
- Docker (for local Postgres via `docker compose`)

## Quick start

```bash
cd candidate/service

# 1. Start Postgres
docker compose up -d

# 2. Configure environment
cp .env.example .env
# .env.example already matches docker-compose.yml's credentials —
# no edits needed for local dev.

# 3. Install dependencies
npm install

# 4. Apply database migrations
npm run migration:run

# 5. Start the API
npm run start:dev
```

The API listens on `http://localhost:3000`. Confirm it's up:

```bash
curl http://localhost:3000/health   # {"status":"ok"} — no DB dependency
curl http://localhost:3000/ready    # {"status":"ok"} — runs SELECT 1 against Postgres
```

Interactive API docs (Swagger UI, generated from the same DTOs that
enforce validation): `http://localhost:3000/api-docs`.

## Environment variables

| Variable | Required | Default (`.env.example`) | Notes |
|---|---|---|---|
| `DATABASE_URL` | yes | `postgresql://postgres:postgres@localhost:5432/orders` | Matches `docker-compose.yml` |
| `FRONTEND_ORIGIN` | yes | `http://localhost:5173` | CORS-allowed origin; must match wherever `provided/frontend/` runs |
| `DB_POOL_SIZE` | no | `10` | Small default is intentional at this scale — see `.claude/skills/database-conventions` before changing |
| `PORT` | no | `3000` | |

Startup fails fast (before the app finishes bootstrapping) if a required
variable is missing or malformed — see `src/common/config/env.validation.ts`.

## Running tests

```bash
npm run test              # unit tests (mocked, no DB required)
npm run test -- --coverage

npm run test:e2e          # integration tests — requires Postgres running
                           # (docker compose up -d) and migrations applied
```

Both suites run in CI on every push/PR to `main`
(`.github/workflows/ci.yml`), against a throwaway Postgres service
container.

## Using the provided frontend harness

```bash
cd provided/frontend
cp .env.example .env      # VITE_API_BASE_URL=http://localhost:3000
npm install
npm run dev               # http://localhost:5173
```

With the backend running and `FRONTEND_ORIGIN=http://localhost:5173` set
(the `.env.example` default), the harness can create orders, replay an
`Idempotency-Key`, and drive status transitions end-to-end. See
`SPEC.md` §9 for the one known harness limitation (the `cancelled`
status, added beyond the original five-state brief, may not be
selectable in the harness UI — verify it via `curl` or `/api-docs`
instead).

## Project structure

```
src/
├── orders/            # the one feature module: controller, service,
│                       # repository, DTOs, entities, transition guard
├── health/             # GET /health, GET /ready
└── common/             # cross-cutting only: exception filter, response
                        # interceptor, correlation-id middleware,
                        # structured logger, env validation

database/
├── data-source.ts      # TypeORM CLI config (standalone, outside Nest DI)
└── migrations/         # hand-written migrations, never in src/

test/
├── unit/               # mirrors src/, mocked dependencies
└── integration/        # *.e2e-spec.ts, real Postgres via supertest

infra/terraform/         # plan-only AWS module (ECS Fargate + RDS) — see
                        # TASKS.md Phase 8 for why this is plan-only
```

## Database migrations

```bash
npm run migration:run
npm run migration:revert
npm run migration:generate -- database/migrations/<Name>
```

Migrations are hand-written (not CLI-generated) per
`.claude/skills/database-conventions` and live only in
`database/migrations/`. Never edit an already-applied migration on a
shared branch — add a new one instead.

## Design notes, deviations, and self-review

The full design rationale, the one deliberate deviation from the
original brief (a sixth `cancelled` status), and self-review notes
(including manual end-to-end harness verification) live in
[`SPEC.md`](./SPEC.md), particularly §3, §9, and §12.
[`TASKS.md`](./TASKS.md) tracks what's been built, phase by phase, with
notes on every non-obvious decision and every subagent-review finding
along the way. [`AI_USAGE.md`](./AI_USAGE.md) documents how AI tooling
was used to build this.
