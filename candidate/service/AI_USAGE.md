# AI_USAGE.md

## Tooling

Claude Code, driven from a project-specific `CLAUDE.md`, nine skills
split by concern (TypeScript style, NestJS architecture, validation and
guards, error handling, logging and audit, database conventions, testing
standards, git conventions, and a feature-implementation workflow that
sequences the others for a given task), five subagents (`spec-critic`,
`code-reviewer`, `test-writer`, `security-auditor`, `db-reviewer`), two
MCP connectors (`postgres`, `github`, both scoped to read-only tool
permissions), and four hooks (lint-on-edit, test-on-edit, secret-
blocking, and a session-start check for required env vars). Full detail
lives under `.claude/`.

## Design decisions I made, not the agent

**The `cancelled` state.** The brief specifies five order statuses, with
`rejected` "reachable from the appropriate states" left to judgment. My
first draft made `rejected` reachable from both `received` and
`accepted`. On review I concluded that conflates two different events,
declining an order before taking it on, versus stopping one already
accepted, so I added a sixth status, `cancelled`, reachable from
`accepted` and `in_progress`, and documented it as a deliberate
deviation from the brief (SPEC.md Section 3) rather than a silent addition.
Trade-off: the provided frontend harness's transition control was built
against the original five-status contract, so it may not expose
`cancelled`, flagged as a known limitation (SPEC.md Section 9) with a manual
verification path via `/api-docs` rather than treated as a service bug.

**Instrumentation: structured logs, not a metrics endpoint.** The brief
allows either, with reasoning requested either way. I chose logs plus
the audit-trail table over a `/metrics` endpoint because there's no
scraper consuming metrics at this scale yet, flagged as the first thing
I'd add given a real deploy target (SPEC.md Section 6).

## Judgment calls on tooling scope

Considered and rejected a Postman MCP connector: request/response
verification is already fully covered by the Vitest integration suite
against real Postgres in CI, and a second Postman-based collection would
assert the same behavior in a format that can silently drift out of sync
with the actual tests. Added `@nestjs/swagger` instead, a plain NestJS
dependency, not an MCP concern, since it keeps API docs generated
directly from the same DTOs that enforce validation, so the two can't
drift apart. Also considered a docs-platform MCP (Notion/Confluence-
style); skipped it since there's no external documentation destination
in scope for this project, the real deliverables are markdown files in
the repo itself.

## Rough edges I found in my own setup, and fixed

**Commit-message enforcement.** My first pass used a Claude Code
`PreToolUse` hook that regex-matched `git commit -m "..."` commands.
Problem: it only fires when Claude Code itself runs the commit, a
teammate, or me committing by hand, bypasses it entirely, and the regex
is fragile against multi-line messages. Replaced it with `commitlint` +
a real Husky `commit-msg` git hook, which fires on every commit
regardless of who or what tool made it.

**Silent MCP failure.** The `postgres` and `github` MCP servers need
`DATABASE_URL`/`GITHUB_TOKEN` set in the shell *before* Claude Code
starts, they're spawned and read the environment once, at session
start, before any tool call runs, so a missing var can't be fixed
mid-session by the agent itself. Originally this failed with no visible
error. Added a `SessionStart` hook that checks for both vars up front
and prints the exact `export` command needed, instead of a silent
"the db-reviewer subagent just can't do anything" mystery.

**Scaffolding gap.** My original task list said "scaffold the service"
but never explicitly said to remove Nest's default `app.controller.ts`/
`app.service.ts` boilerplate. Given a separate working-agreement rule
telling the agent not to expand scope beyond what's written in
`TASKS.md`, an unstated cleanup step could easily get silently skipped
rather than assumed. Added it as an explicit line item instead of
relying on the agent to infer it.

**Attribution trailer.** Noticed Claude Code appends a `Co-Authored-By:
Claude` trailer to commits by default. Decided to disable it via the
`attribution` setting in the shared `.claude/settings.json`, a
deliberate, visible team policy rather than a personal preference hidden
in a gitignored file.

## Where the agent helped most

*(To fill in once Phase 2 onward has actually run, e.g. scaffold speed,
or a specific case where `@spec-critic`'s output changed something
concrete in SPEC.md before any code existed. Name the specific moment,
not a general impression.)*

## Where the agent got something wrong, and how I caught it

*(This is the section that matters most, and it can't be written in
advance. Capture the real moment as it happens, the brief specifically
points at the idempotency logic and the invalid-transition handling as
likely places to look. Good questions to check once code exists: did the
idempotency insert do a find-then-insert, which races under concurrent
replay, instead of insert-then-catch-unique-violation? Did the
transition guard correctly reject `in_progress → rejected` now that
`rejected` is tightened to `received`-only? Did the audit row write
land in the same DB transaction as the status update, or as an
afterthought? Name which subagent, test, or manual read caught it, not
just that it was caught.)*

## What I'd change for a longer-lived team version of this

- `commitlint`/Husky is already the team-ready version of commit
  enforcement, nothing further needed there.
- Skills are currently split by technical concern; on a bigger codebase
  I'd add skills per bounded context/domain module as they emerge.
- Would add a `/metrics` endpoint the moment there's a real deploy
  target with a scraper.
- Would revisit offset pagination for keyset pagination once data volume
  justified it.