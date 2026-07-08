import {
  BadRequestException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseShapeInterceptor } from './common/interceptors/response-shape.interceptor';
import { AppLogger } from './common/logging/app-logger.service';

// Shared by main.ts and integration tests so the two can't silently
// drift apart — an e2e test bootstrapped without this wiring would
// exercise a different pipeline than the real running service.
export function configureApp(app: INestApplication): void {
  app.useLogger(new AppLogger());

  // Deliberately helmet()/cors() *before* Swagger — the reverse of
  // nestjs-architecture's literal example ordering. @security-auditor
  // found that SwaggerModule.setup() mounts a raw Express sub-router
  // that fully handles its own responses, so anything registered after
  // it never ran for /api-docs*, confirmed live via curl: those routes
  // had none of helmet's headers and no CORS header. Reordering fixes
  // this for helmet()/cors() specifically, because both are themselves
  // raw Express middleware applied directly on the underlying adapter —
  // same mechanism Swagger's router uses — so registration order
  // between them actually matters. The skill's stated reason (helmet's
  // CSP blocking Swagger UI's inline scripts) doesn't apply here — the
  // generated Swagger HTML uses only external <script src> tags, no
  // inline scripts — confirmed by curling /api-docs with this order and
  // getting a full, correctly-rendered page plus the expected CSP header.
  //
  // This does *not* fix everything, though: `x-correlation-id` (set by
  // `CorrelationMiddleware`, registered via Nest's own
  // `MiddlewareConsumer.forRoutes('*')`) still never reaches /api-docs* —
  // confirmed via curl — because Nest's middleware/guard pipeline only
  // wraps routes registered through its own module system, which
  // Swagger's directly-mounted sub-router bypasses regardless of
  // ordering. Accepted as a known, low-severity gap: /api-docs is an
  // unauthenticated, read-only docs page with no business logic or PII
  // involved, so missing request-correlation on it (unlike missing
  // security headers) has no real security bearing.
  app.use(helmet());

  // Reads through the validated ConfigService rather than process.env
  // directly, so this is guaranteed to be the same value startup
  // validation (env.validation.ts) already checked, not a value that
  // could drift out of sync with it.
  const configService = app.get(ConfigService);
  app.enableCors({ origin: configService.get<string>('FRONTEND_ORIGIN') });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Mirantus Order Management Service')
    .setDescription('Order lifecycle API for diagnostic test orders')
    .setVersion('1.0')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, swaggerDocument);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // SPEC.md §5: `message` is always a single string, never
      // class-validator's default per-constraint array.
      exceptionFactory: (errors) => {
        const message = errors
          .flatMap((error) => Object.values(error.constraints ?? {}))
          .join('; ');
        return new BadRequestException(message);
      },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseShapeInterceptor());
}
