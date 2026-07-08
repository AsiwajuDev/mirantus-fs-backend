import {
  BadRequestException,
  HttpException,
  type ArgumentsHost,
} from '@nestjs/common';

import { HttpExceptionFilter } from '../../../src/common/filters/http-exception.filter';
import { InvalidTransitionException } from '../../../src/orders/exceptions/invalid-transition.exception';
import { OrderNotFoundException } from '../../../src/orders/exceptions/order-not-found.exception';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
  path: string;
  timestamp: string;
  from?: unknown;
  to?: unknown;
  correlationId?: unknown;
}

function buildHost(path: string) {
  const json = jest.fn<void, [ErrorBody]>();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url: path }),
    }),
  } as unknown as ArgumentsHost;

  return {
    host,
    status,
    body: (): ErrorBody => {
      const call = json.mock.calls[0];
      if (!call) {
        throw new Error('expected the response json() to have been called');
      }
      return call[0];
    },
  };
}

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  it('shapes OrderNotFoundException as the documented base 404 body', () => {
    const { host, status, body } = buildHost('/orders/123');

    filter.catch(new OrderNotFoundException('123'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(body()).toMatchObject({
      statusCode: 404,
      error: 'OrderNotFoundException',
      message: 'Order 123 not found',
      path: '/orders/123',
    });
    expect(typeof body().timestamp).toBe('string');
    expect(body()).not.toHaveProperty('correlationId');
  });

  it('adds from/to fields for InvalidTransitionException', () => {
    const { host, body } = buildHost('/orders/123/status');

    filter.catch(new InvalidTransitionException('completed', 'accepted'), host);

    expect(body()).toMatchObject({
      statusCode: 409,
      error: 'InvalidTransitionException',
      message: 'Cannot transition from completed to accepted',
      from: 'completed',
      to: 'accepted',
    });
  });

  it('flattens a class-validator-style array message into one string', () => {
    const { host, body } = buildHost('/orders');

    filter.catch(
      new BadRequestException(['a is required', 'b is invalid']),
      host,
    );

    expect(body().message).toBe('a is required; b is invalid');
  });

  it('uses a raw HttpException string response as-is (bypassing the convenience subclasses)', () => {
    const { host, status, body } = buildHost('/orders');

    filter.catch(new HttpException('teapot', 418), host);

    expect(status).toHaveBeenCalledWith(418);
    expect(body()).toMatchObject({
      statusCode: 418,
      message: 'teapot',
    });
  });

  it('falls back to exception.message when the response object has no message field', () => {
    const { host, body } = buildHost('/orders');

    filter.catch(new HttpException({ foo: 'bar' }, 400), host);

    expect(body().message).toBe('Http Exception');
  });

  it('falls back to exception.message when the message field is neither a string nor an array', () => {
    const { host, body } = buildHost('/orders');

    filter.catch(
      new HttpException({ message: 42, statusCode: 400 }, 400),
      host,
    );

    expect(body().message).toBe('Http Exception');
  });

  it('maps a non-HttpException to a generic 500 without leaking internals', () => {
    const { host, status, body } = buildHost('/orders');

    filter.catch(new Error('connection refused: pg://secret@host'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(body()).toMatchObject({
      statusCode: 500,
      error: 'InternalServerError',
      message: 'Internal server error',
    });
  });
});
