---
name: logging-and-audit
description: Structured logging conventions and the audit trail requirement for state-changing operations. Use for any code that logs, or that changes order state.
---

# Logging and Audit

Use structured logging for operational visibility and maintain a durable audit trail for every state-changing operation.

---

# Structured Logging

## Always Use Structured Logs

All logs must include meaningful context.

Example:

```ts
// ✅
this.logger.log(
  'Order status changed',
  {
    orderId,
    from,
    to,
    partnerId,
  },
);

this.logger.warn(
  'Idempotency key replayed with different body',
  {
    idempotencyKey,
    partnerId,
  },
);

this.logger.error(
  'Failed to apply transition',
  {
    orderId,
    error: err.message,
    stack: err.stack,
  },
);
```

---

## Avoid Context-Free Logs

Do not use logs without operational context.

Example:

```ts
// ❌
console.log('order updated');
```

Logs without identifiers or metadata are ineffective in aggregated logging systems.

---

# Sensitive Data Protection

Never log:

- `patientReference`
- Patient-identifying information
- Any combination of fields that could re-identify a person

Only log:

- Pseudonymous references.
- Required operational identifiers.
- Non-sensitive metadata.

Do not log richer patient context even if it appears useful for debugging.

---

# Request Correlation

Every request must have a correlation identifier.

Requirements:

- Generate or receive a request correlation ID.
- Attach it to the request context.
- Propagate it through logger context.
- Include it in all related log entries.

This allows a single request flow to be traced across:

- Controllers
- Services
- Repositories
- External integrations

---

# Audit Trail

## Audit Logs Are Not Application Logs

Application logs are for:

- Debugging
- Troubleshooting
- Operational monitoring

They are not a replacement for a durable audit trail.

The audit trail is a queryable record answering:

- Who changed the order?
- What changed?
- When did it change?

---

# Audit Table

State changes must be recorded in a dedicated audit table.

Table:

```text
order_status_audit
```

Schema:

```text
id              uuid pk
order_id        uuid fk -> orders.id
previous_status text nullable
new_status      text
changed_by      text
created_at      timestamptz default now()
```

Field requirements:

| Field | Description |
|---|---|
| `id` | Unique audit record identifier |
| `order_id` | Reference to the affected order |
| `previous_status` | Previous status; nullable for initial creation |
| `new_status` | Status after the change |
| `changed_by` | Actor responsible for the change (`partnerId` or `system`) |
| `created_at` | Time the state change occurred |

---

# Transactional Audit Writes

Audit records must be created in the **same database transaction** as the state mutation.

The state change and audit entry must be atomic:

```text
Begin Transaction
        ↓
Update Order Status
        ↓
Insert Audit Record
        ↓
Commit Transaction
```

If either operation fails:

```text
Rollback Transaction
```

The database must never contain:

- A changed order without an audit record.
- An audit record for a failed state change.

---

## Correct Implementation

```ts
await this.dataSource.transaction(async manager => {
  const updated = await manager
    .getRepository(Order)
    .save({
      ...order,
      status: next,
    });

  await manager
    .getRepository(OrderStatusAudit)
    .insert({
      orderId: order.id,
      previousStatus: order.status,
      newStatus: next,
      changedBy: actor,
    });

  return updated;
});
```

`actor` is not always the same value — per SPEC.md: on order
creation it's the `partnerId` from the request body; on
`PATCH /orders/:id/status` it's the literal string `"system"`, since
that request carries no partner identity and authentication is out of
scope (§8). Don't default this to `partnerId` unconditionally — the
transition endpoint has no partner identity to put there.

---

# Incorrect Implementation

Do not write audit records:

- After returning the API response.
- In asynchronous post-processing.
- In interceptors after the database mutation.

Example failure scenario:

```text
Update Order
      ↓
Send Response
      ↓
Process Dies
      ↓
Audit Insert Never Happens
```

The audit write must happen inside the same transaction as the mutation it records.
````
