---
name: nestjs-architecture
description: Module layout, dependency injection, request lifecycle, and bootstrap conventions — the shape Nest's own docs recommend. Use for any structural decision (new module, new provider, main.ts changes).
---

# NestJS Architecture

Follow NestJS recommended architectural patterns for module organization, dependency injection, request lifecycle handling, and application bootstrap.

---

# Layering

Use the following architecture:

```text
Controller → Service → Repository
```

## Controllers

Controllers must remain thin.

Responsibilities:

- Receive HTTP requests.
- Parse input through DTOs and Pipes.
- Delegate to one service method.
- Return the result.

Controllers must not contain:

- Business rules.
- State transition logic.
- Idempotency logic.
- Persistence logic.

---

## Services

Services contain all business logic.

Examples:

- Status transition validation.
- Idempotency handling.
- Domain rules.
- Workflow orchestration.

---

## Repositories

Repositories and TypeORM own persistence.

Rules:

- Services do not write raw SQL.
- Services interact with persistence through repositories.
- Database-specific operations remain in the data layer.

---

# Module Layout

Organize code by feature.

Each feature should contain everything required for that feature.

Example:

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

---

## Shared Code

Only genuinely cross-cutting concerns belong in:

```text
src/common/
```

Examples:

- Global exception filters.
- Global pipes.
- Shared decorators.
- Common infrastructure.

---

## Avoid Global Type Folders

Do not create:

```text
src/dto/
src/controllers/
src/services/
```

Feature ownership should remain clear through Nest modules.

---

# Dependency Injection

Use constructor injection only.

Example:

```ts
@Injectable()
export class OrdersService {
  constructor(
    private readonly repository: OrdersRepository,
  ) {}
}
```

---

## Provider Scope

Use default singleton scope.

Avoid:

```text
REQUEST
```

scope unless there is a specific requirement.

Reason:

- Creates new providers per request.
- Increases overhead.
- Reduces throughput.

---

# Request Lifecycle

NestJS request flow:

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
Exception Filters
    ↓
Response
```

---

## Guards

Run first.

Use guards for:

- Authentication.
- Authorization.
- Structural preconditions.

Examples:

- Validate partner identity.
- Reject malformed request context.

---

## Pipes

Pipes validate and transform DTO input.

Responsibilities:

- Validate request shape.
- Convert types where configured.
- Produce `400 Bad Request` responses.

Controllers should not perform manual field validation.

---

## Response Interceptors

Post-processing interceptors validate and shape outgoing responses.

Responsibilities:

- Remove internal fields.
- Prevent accidental data leakage.
- Enforce response envelopes.
- Normalize API responses.

Input validation alone is insufficient.

---

## Exception Filters

Exception filters catch errors from anywhere in the request lifecycle.

Responsibilities:

- Normalize error responses.
- Apply shared error formatting.
- Prevent inconsistent controller/service error payloads.

See:

```text
error-handling
```

skill.

---

# Bootstrap (`main.ts`)

Bootstrap ordering is intentional.

Swagger setup must happen **before** `helmet()`.

Reason:

- Helmet's default Content Security Policy may block Swagger UI inline scripts/styles.
- Fix Swagger-specific CSP issues with scoped exceptions.
- Do not disable Helmet globally.

---

## Required Bootstrap Order

Example:

```ts
const config = new DocumentBuilder()
  .setTitle('Mirantus Order Management Service')
  .setDescription('Order lifecycle API for diagnostic test orders')
  .setVersion('1.0')
  .build();

const document = SwaggerModule.createDocument(app, config);

SwaggerModule.setup(
  'api-docs',
  app,
  document,
);

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

app.useGlobalFilters(
  new HttpExceptionFilter(),
);
```

---

# Rate Limiting

Use:

```text
@nestjs/throttler
```

Requirements:

- Protect mutating endpoints.
- Apply as a global guard.

Avoid controller-by-controller configuration.

Global configuration ensures new endpoints inherit protection automatically.

---

# DTO Documentation and Validation

DTOs must define both:

- Validation rules.
- API documentation metadata.

Use:

- `class-validator` for enforcement.
- `@ApiProperty` for Swagger documentation.

Example:

```ts
export class CreateOrderDto {
  @ApiProperty({
    example: 'b3f1c2e4-...',
    description: 'Submitting partner UUID',
  })
  @IsUUID()
  partnerId: string;

  @ApiProperty({
    enum: ['routine', 'urgent'],
  })
  @IsIn(['routine', 'urgent'])
  priority: 'routine' | 'urgent';
}
```

The DTO becomes the single source of truth.

Avoid maintaining separate API documentation that can drift from actual validation behavior.

---

# Configuration

Use:

```text
@nestjs/config
```

with validated configuration.

Validation options:

- Joi
- class-validator

Requirements:

- Validate required environment variables during startup.
- Fail fast when configuration is missing or invalid.