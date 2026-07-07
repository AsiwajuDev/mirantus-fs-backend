# mirantus-fs-backend — Agent Context

## What This Is

A take-home backend service for a fictional health-tech diagnostics platform.

The frontend harness located at:

```text
provided/frontend/
```

is fixed and must not be modified.

The deliverable is:

```text
candidate/service/
```

The source of truth for behavior is:

```text
candidate/SPEC.md
```

If this file and `SPEC.md` disagree:

1. `SPEC.md` takes precedence.
2. Flag the conflict.
3. Do not guess or silently choose an interpretation.

---

# Stack & Architecture

The service uses:

- NestJS
- PostgreSQL
- TypeORM migrations
- Vitest
- GitHub Actions CI

Architecture follows NestJS recommended practices:

```text
Controller → Service → Repository → Database
```

Principles:

- Controllers remain thin.
- Business logic belongs in services.
- Persistence is handled through repositories/TypeORM.
- Cross-cutting concerns are handled through NestJS providers.

---

# Standards Live in Skills

This file is an index, not the complete specification.

Skills are loaded only when their area is touched. Always read the relevant skill before implementing changes.

Do not infer conventions from:

- memory
- nearby files
- existing implementation patterns that may already be incorrect

| Skill | Covers |
|---|---|
| `typescript-style` | Naming, strict TypeScript configuration, branded types, interface vs type |
| `nestjs-architecture` | Module layout, dependency injection, request lifecycle, bootstrap configuration (`helmet`, throttling, CORS) |
| `validation-and-guards` | DTO validation, guards, pre-handler and post-handler validation |
| `error-handling` | Custom exceptions and global exception filters |
| `logging-and-audit` | Structured logging and audit trail requirements |
| `database-conventions` | Migrations, indexing, transactions, connection pooling |
| `testing-standards` | Coverage targets and test structure |
| `git-and-commits` | Conventional commits and review workflow |

---

# Non-Negotiable Requirements

The following rules cannot be overridden by individual skills.

## Idempotency

Idempotency must be enforced through:

- Database unique constraints
- Correct handling of constraint violations

Do not use:

- Application-level locks
- SELECT-then-INSERT patterns

---

## Status Transitions

Status transition validation must exist in exactly one location.

Do not duplicate transition rules across:

- Controllers
- Services
- Guards
- Tests

---

## Data Privacy

- No real PII may be used.
- Use pseudonymous identifiers only.

---

## Audit Logging

Every state-changing operation must:

- Write an audit record.
- Write it in the same database transaction as the state change.
- Never create audit records as an afterthought.

The database state and audit history must remain consistent.

---

## Error Responses

Every error response must use the same JSON structure through the global exception filter.

Controllers and services must not manually construct error payloads.

---

## Request Validation

Validation happens at both ends of the request lifecycle.

### Incoming Requests

Use:

- Pipes
- Guards

Input must be validated before reaching business logic.

### Outgoing Responses

Use:

- Response interceptors

Output must be validated and shaped before leaving the process.

Do not only validate incoming requests.

---

# Commands

## Start PostgreSQL

```bash
docker compose up -d
```

## Apply Database Migrations

```bash
npm run migration:run
```

## Start Development Server

```bash
npm run start:dev
```

API runs on:

```text
:3000
```

## Run Unit Tests

```bash
npm run test
```

## Run Integration Tests

Requires PostgreSQL running:

```bash
npm run test:e2e
```

---

# Available Subagents

Use the appropriate subagent at the correct stage.

| Agent | When to Use |
|---|---|
| `@spec-critic` | After `SPEC.md` draft, before implementation begins |
| `@code-reviewer` | After each task, before committing |
| `@test-writer` | After feature implementation, using separate context |
| `@security-auditor` | Before closing tasks touching input handling, headers, configuration, or logging |
| `@db-reviewer` | After migrations or query changes; validates against the real PostgreSQL schema using MCP |

---

# MCP

Available MCP connections:

| MCP | Purpose |
|---|---|
| `postgres` | Read-only local development database inspection |
| `github` | PR and CI log inspection |

Configuration:

```text
.mcp.json
```

is project-scoped so the team shares the same setup.

Approve MCP access once when Claude Code prompts during first use.

---

# Working Agreement

## Task Tracking

Keep:

```text
candidate/TASKS.md
```

checkboxes updated as tasks are completed.

---

## Scope Control

If a task requires work outside the defined scope of `TASKS.md`:

1. Stop.
2. Explain the scope expansion.
3. Ask for clarification.

Do not silently expand scope.

---

## Commits

Keep changes:

- Small.
- Reviewable.
- Focused.

Rule:

```text
One task per commit
```
````

