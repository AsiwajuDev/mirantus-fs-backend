---
name: database-conventions
description: Migrations, indexing, transactions, and connection pooling. Use for any schema change, migration, or query.
---

# Database Conventions

Follow these conventions for all schema changes, migrations, database queries, and persistence logic.

---

# Migrations

## Location

All migrations must live in:

```text
database/migrations/
```

Never place migrations inside:

```text
src/
```

Migrations are executed by the TypeORM CLI using:

```text
database/data-source.ts
```

They are not imported or executed at runtime.

---

## Migration Rules

Each migration must:

- Represent one logical database change.
- Include a working `down()` migration.
- Be reversible where possible.

Example:

```ts
export class AddOrderStatusAuditTable {
  async up(): Promise<void> {
    // apply change
  }

  async down(): Promise<void> {
    // revert change
  }
}
```

---

## Applied Migrations

Never modify an already-applied migration on a shared branch.

Incorrect:

```text
Edit existing migration
↓
Commit change
```

Correct:

```text
Create a new migration
↓
Apply incremental change
```

---

# Indexes

The following indexes are required for this schema.

## Idempotency Index

```sql
CREATE UNIQUE INDEX idx_orders_idempotency_key
ON orders (idempotency_key);
```

Purpose:

- Enforces idempotency.
- Prevents duplicate order creation.
- Provides concurrency safety.

---

## Order Filtering Index

```sql
CREATE INDEX idx_orders_partner_status
ON orders (partner_id, status);
```

Purpose:

Supports:

```text
GET /orders
```

filtering by:

- `partner_id`
- `status`

---

# Idempotency Implementation

The database unique constraint is the idempotency mechanism.

Do not add:

- Application-level locks.
- Manual synchronization.
- SELECT-based existence checks.

These add complexity and create race-condition windows.

---

## Correct Pattern

Use insert-first logic:

```ts
try {
  return await this.repo.insert(newOrder);
} catch (err) {
  if (isUniqueViolation(err, 'idx_orders_idempotency_key')) {
    return await this.repo.findByIdempotencyKey(
      newOrder.idempotencyKey,
    );
  }

  throw err;
}
```

This is safe under concurrent duplicate requests.

---

## Incorrect Pattern

Avoid:

```ts
const existing = await this.repo.findByIdempotencyKey(key);

if (!existing) {
  await this.repo.insert(newOrder);
}
```

Why it fails:

```text
Request A                 Request B

SELECT missing            SELECT missing
INSERT                    INSERT
```

Both requests can pass the check before either insert commits.

The database constraint must handle concurrency.

---

# Pagination

Use:

```sql
LIMIT / OFFSET
```

with a bounded page size.

Requirements:

- Provide a default page size.
- Enforce a maximum page size.

Example:

```text
default: 20
maximum: 100
```

---

## Scaling Note

Keyset pagination is a future optimization if the orders table grows beyond what offset pagination handles efficiently.

Document it as a known scaling consideration.

Do not introduce it prematurely for the current dataset size.

---

# Connection Pooling

Configure TypeORM connection pooling explicitly.

Use environment configuration:

```text
DB_POOL_SIZE
```

Example:

```text
DB_POOL_SIZE=10
```

Requirements:

- Keep pool size appropriate for service scale.
- Avoid creating direct database clients.

Never open ad-hoc connections outside the configured TypeORM pool.

---

# SQL Safety

Do not use raw string SQL concatenation.

Avoid:

```ts
const query = `
  SELECT *
  FROM orders
  WHERE id = ${id}
`;
```

Use:

- Repository methods.
- Parameterized queries.
- TypeORM QueryBuilder.

Reasons:

- Prevent SQL injection.
- Maintain query correctness.
- Keep database interactions consistent.