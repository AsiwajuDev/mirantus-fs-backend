import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { getCorrelationId } from '../correlation/correlation-context';

interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string;
  path: string;
  timestamp: string;
  correlationId?: string;
  from?: unknown;
  to?: unknown;
}

// Every error, of any kind, passes through here — per root CLAUDE.md's
// non-negotiable, controllers/services never construct error JSON by
// hand.
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!isHttpException) {
      // Unexpected failures must leave a trace somewhere — the generic
      // 500 response deliberately tells the client nothing.
      this.logger.error('Unhandled exception', {
        error: exception instanceof Error ? exception.message : exception,
        stack: exception instanceof Error ? exception.stack : undefined,
      });
    }

    const correlationId = getCorrelationId();

    const body: ErrorResponseBody = {
      statusCode,
      error: isHttpException
        ? exception.constructor.name
        : 'InternalServerError',
      message: this.extractMessage(exception, isHttpException),
      path: request.url,
      timestamp: new Date().toISOString(),
      ...(correlationId !== undefined ? { correlationId } : {}),
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
