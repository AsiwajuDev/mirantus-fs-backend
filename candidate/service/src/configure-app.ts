import {
  BadRequestException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';

import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseShapeInterceptor } from './common/interceptors/response-shape.interceptor';

// Shared by main.ts and integration tests so the two can't silently
// drift apart — an e2e test bootstrapped without this wiring would
// exercise a different pipeline than the real running service.
export function configureApp(app: INestApplication): void {
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
