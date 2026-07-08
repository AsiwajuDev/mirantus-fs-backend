import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string;
  path: string;
  timestamp: string;
  from?: unknown;
  to?: unknown;
}

// Every error, of any kind, passes through here — per root CLAUDE.md's
// non-negotiable, controllers/services never construct error JSON by
// hand. `correlationId` (in SPEC.md §5's documented shape) is
// deliberately omitted until Phase 6's request-correlation middleware
// exists; a fabricated ID with nothing to correlate against would be
// worse than the field's absence.
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const body: ErrorResponseBody = {
      statusCode,
      error: isHttpException
        ? exception.constructor.name
        : 'InternalServerError',
      message: this.extractMessage(exception, isHttpException),
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    const exceptionResponse = isHttpException
      ? exception.getResponse()
      : undefined;
    if (this.hasTransitionFields(exceptionResponse)) {
      body.from = exceptionResponse.from;
      body.to = exceptionResponse.to;
    }

    response.status(statusCode).json(body);
  }

  private extractMessage(exception: unknown, isHttpException: boolean): string {
    if (!isHttpException) {
      return 'Internal server error';
    }

    const responseBody = (exception as HttpException).getResponse();
    if (typeof responseBody === 'string') {
      return responseBody;
    }

    if (
      typeof responseBody === 'object' &&
      responseBody !== null &&
      'message' in responseBody
    ) {
      const message = responseBody.message;
      if (Array.isArray(message)) {
        return message.join('; ');
      }
      if (typeof message === 'string') {
        return message;
      }
    }

    return (exception as HttpException).message;
  }

  private hasTransitionFields(
    body: unknown,
  ): body is { from: unknown; to: unknown } {
    return (
      typeof body === 'object' &&
      body !== null &&
      'from' in body &&
      'to' in body
    );
  }
}
