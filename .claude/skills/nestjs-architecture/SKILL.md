---
name: nestjs-architecture
description: Module layout, dependency injection, request lifecycle, and bootstrap conventions — the shape Nest's own docs recommend. Use for any structural decision (new module, new provider, main.ts changes).
---

# NestJS Architecture

## Layering

Follow a strict layered architecture:

```text
Controller → Service → Repository
```

- **Controllers** should remain thin:
  - Parse and validate requests using DTOs and Pipes.
  - Call a single service method.
  - Return the response.

- **Services** contain all business logic, including:
  - Transition guards.
  - Idempotency checks.
  - Domain rules.
  - Orchestration between repositories and external services.

- **Repositories** (TypeORM) own persistence.
  - Services should never construct raw SQL queries.

---

## Module Layout

Organize the project by **feature**, not by file type.

```text
src/
└── orders/
    ├── orders.module.ts
    ├── orders.controller.ts
    ├── orders.service.ts
    ├── dto/
    ├── entities/
    └── order-status.enum.ts
```

Only genuinely cross-cutting concerns belong in `src/common/`, such as:

- Global exception filters
- Global pipes
- Shared decorators
- Utility functions

**Avoid** project-wide folders such as:

```text
src/controllers/
src/services/
src/dto/
```

These work against NestJS's module system and make feature ownership unclear.

---

## Dependency Injection

Use **constructor injection exclusively**.

```ts
@Injectable()
export class OrdersService {
  constructor(
    private readonly repository: OrdersRepository,
  ) {}
}
```

### Provider Scope

Use the default **singleton scope** unless there is a compelling reason otherwise.

Avoid `REQUEST` scope because it:

- Creates new provider instances per request.
- Increases memory usage.
- Reduces throughput.
- Is unnecessary for most applications.

---

## Request Lifecycle

NestJS processes requests in the following order:

```text
Request
    ↓
Guards
    ↓
Interceptors (pre)
    ↓
Pipes
    ↓
Controller
    ↓
Service
    ↓
Interceptors (post)
    ↓
Exception Filters (if an error is thrown)
    ↓
Response
```

### Guards

Run first.

Use guards to reject requests before business logic executes, for example:

- Authentication
- Authorization
- Structural preconditions
- Partner validation

---

### Pipes

Responsible for:

- Validation
- Transformation
- DTO parsing

This is where most **400 Bad Request** responses originate.

---

### Controllers

Controllers should only:

- Accept validated input.
- Delegate to the service.
- Return the result.

Business rules do **not** belong here.

---

### Services

Services implement:

- Business logic
- Domain rules
- State transitions
- Idempotency
- Persistence orchestration

---

### Interceptors (Post)

Use response interceptors to:

- Shape responses.
- Remove internal fields.
- Enforce a consistent response envelope.
- Apply serialization.

Input validation alone is insufficient—response consistency matters as well.

---

### Exception Filters

Exception filters catch errors thrown anywhere in the pipeline and convert them into the application's standardized error response format.

---

## Bootstrap (`main.ts`)

The following bootstrap configuration is considered mandatory:

```ts
app.use(helmet());

app.enableCors({
  origin: process.env.FRONTEND_ORIGIN,
});

app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
);

app.useGlobalFilters(new HttpExceptionFilter());
```

### Rate Limiting

Use `@nestjs/throttler`.

Configure it as a **global guard** so every new endpoint inherits protection automatically instead of decorating individual controllers.

---

## Configuration

Use `@nestjs/config` together with a validated configuration schema.

Supported validation approaches include:

- Joi
- class-validator

Applications should **fail during startup** if required environment variables are missing or invalid rather than failing during request processing.

This ensures configuration issues are detected immediately and prevents partially configured deployments.