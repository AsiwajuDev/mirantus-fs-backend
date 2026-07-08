---
name: git-and-commits
description: Commit message format and review checklist. Use before any git commit.
---

# Git Conventions

Follow these conventions for commits and pre-commit review.

---

# Conventional Commits

Commit messages must follow the Conventional Commits format.

Format:

```text
type: short description
```

Examples:

```text
feat: add idempotent order creation endpoint

fix: correct transition table for rejected status

test: add integration coverage for idempotency replay

docs: document audit trail schema in SPEC.md
```

---

# Commit Scope

One task from:

```text
candidate/TASKS.md
```

per commit.

Purpose:

- Keeps history readable.
- Makes changes easier to review.
- Creates a clear build timeline.

Avoid:

```text
One large commit containing multiple unrelated tasks
```

Prefer:

```text
Task 1 → Commit
Task 2 → Commit
Task 3 → Commit
```

---

# Before Committing

Confirm all items:

```text
[ ] Changes match the relevant skill(s) for the touched area
[ ] Tests cover the new behavior, not only existing behavior changes
[ ] No secrets, connection strings, or tokens exist in the diff
[ ] candidate/TASKS.md checkbox is updated
[ ] @code-reviewer has reviewed the diff
[ ] No unresolved blocking issues remain
```

---

# Review Requirement

Before every commit:

1. Run `@code-reviewer`.
2. Resolve all blocking findings.
3. Commit only after the review is clean.

Do not bypass review for small changes if they belong to a completed task.
````
