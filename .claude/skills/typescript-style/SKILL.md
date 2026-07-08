---
name: typescript-style
description: Naming conventions, strict tsconfig, and type-system rules for this codebase. Use for any TypeScript file, anywhere in the service.
---

# TypeScript Style

## Naming Conventions

Follow consistent naming conventions across the codebase.

### Variables, Functions, and Methods

Use `camelCase`.

Examples:

```ts
fetchOrderById
partnerId
validateTransition
```

---

### Classes, Interfaces, and Types

Use `PascalCase`.

Examples:

```ts
OrdersService
CreateOrderDto
OrderStatus
```

---

### Constants

Use `SCREAMING_SNAKE_CASE`.

Examples:

```ts
MAX_PAGE_SIZE
DEFAULT_TIMEOUT
```

---

### File Names

Use `kebab-case` following NestJS CLI conventions.

Examples:

```text
orders.service.ts
create-order.dto.ts
order-status.enum.ts
```

**Exception:** TypeORM migrations under `database/migrations/` use the
TypeORM CLI's own `{timestamp}-PascalCase.ts` convention (e.g.
`1783512134007-CreateOrdersAndAuditTables.ts`) instead of kebab-case —
this is the tool's naming contract, not a violation to flag.

---

# TypeScript Compiler Configuration

The project must use strict TypeScript settings.

`tsconfig.json` must include:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

These settings are mandatory across the entire service.

---

# Branded Types

Use branded types only at genuine type-safety boundaries.

## Correct Usage

Use branding when two values share the same runtime type but represent different concepts.

Example:

```ts
export type OrderID = string & { __brand: 'OrderID' };
```

This prevents accidental interchange between an order identifier and a normal string.

---

## Avoid Overuse

Do not create branded types where they provide little additional safety.

Example:

```ts
// Avoid
export type StatusLabel = string & { __brand: 'StatusLabel' };
```

Branding should reduce real risk, not add unnecessary friction.

---

# Interface vs Type

Use:

## `interface`

For object shapes intended to be extended.

Examples:

- Entities
- DTOs
- Service contracts

```ts
interface Order {
  id: OrderID;
  partnerId: string;
  status: OrderStatus;
}
```

---

## `type`

For:

- Unions
- Intersections
- Branded types

Example:

```ts
type OrderStatus =
  | 'received'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'rejected';
```

---

# Generics

Generic types must always be constrained.

## Correct

```ts
function findById<T extends { id: string }>(
  items: T[],
  id: string,
): T | undefined {
  return items.find(i => i.id === id);
}
```

---

## Incorrect

Avoid unconstrained or `any`-based generics:

```ts
function findById(items: any[], id: string): any {
  // ...
}
```

`any` removes TypeScript's safety guarantees.

---

# Import Order

Imports must follow this order:

## 1. External Libraries

Alphabetical order.

Example:

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
```

---

## 2. Internal Modules

Order by:

1. Feature/module
2. Alphabetical order

Example:

```ts
import { AuditService } from '../audit/audit.service';
```

---

## 3. Relative Imports Within the Same Module

Example:

```ts
import { OrderStatus } from './order-status.enum';
```

---

# Example Import Structure

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { AuditService } from '../audit/audit.service';

import { OrderStatus } from './order-status.enum';
```