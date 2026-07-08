import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';

import { ResponseShapeInterceptor } from '../../../src/common/interceptors/response-shape.interceptor';
import { Order } from '../../../src/orders/entities/order.entity';

function handlerReturning(value: unknown): CallHandler {
  return { handle: () => of(value) };
}

async function firstEmitted(observable: ReturnType<CallHandler['handle']>) {
  return new Promise((resolve) => {
    observable.subscribe((value) => resolve(value));
  });
}

describe('ResponseShapeInterceptor', () => {
  const interceptor = new ResponseShapeInterceptor();
  const context = {} as ExecutionContext;

  it('strips @Exclude()-marked fields (idempotencyKey) from a single Order', async () => {
    const order = Object.assign(new Order(), {
      id: 'order-1',
      partnerId: 'partner-a',
      patientReference: 'PT-2026-00417',
      requestedLocation: 'Lagos Diagnostics, Ikeja',
      priority: 'routine',
      status: 'received',
      idempotencyKey: 'c4a2d1e5-0000-0000-0000-000000000099',
    });

    const result = await firstEmitted(
      interceptor.intercept(context, handlerReturning(order)).pipe(),
    );

    expect(result).not.toHaveProperty('idempotencyKey');
    expect(result).toMatchObject({ id: 'order-1', status: 'received' });
  });

  it('strips idempotencyKey from every Order nested inside a paginated response', async () => {
    const order = Object.assign(new Order(), {
      id: 'order-1',
      idempotencyKey: 'c4a2d1e5-0000-0000-0000-000000000099',
      status: 'received',
    });
    const paginated = { data: [order], page: 1, pageSize: 20, total: 1 };

    const result = (await firstEmitted(
      interceptor.intercept(context, handlerReturning(paginated)).pipe(),
    )) as { data: Array<Record<string, unknown>> };

    expect(result.data[0]).not.toHaveProperty('idempotencyKey');
    expect(result.data[0]).toMatchObject({ id: 'order-1', status: 'received' });
  });
});
