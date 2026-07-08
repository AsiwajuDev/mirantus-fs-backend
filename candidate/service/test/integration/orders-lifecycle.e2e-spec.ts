import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { createPartnerIdTracker } from './support/partner-id-tracker';

interface OrderBody {
  id: string;
  partnerId: string;
  status: string;
}

interface AuditRow {
  previous_status: string | null;
  new_status: string;
  changed_by: string;
}

const partnerIdTracker = createPartnerIdTracker();

function createOrderPayload(partnerId: string = randomUUID()) {
  return {
    partnerId: partnerIdTracker.track(partnerId),
    patientReference: 'PT-2026-00417',
    requestedLocation: 'Lagos Diagnostics, Ikeja',
    priority: 'routine',
  };
}

// Real Postgres container required (see candidate/service/CLAUDE.md).
// Phase 7's deeper lifecycle/business-behavior scenarios, layered on top
// of orders.e2e-spec.ts's per-endpoint contract tests. Idempotency
// replay via row count is already covered there
// ("replays the same order (same row) for a repeated Idempotency-Key");
// not duplicated here.
describe('Orders lifecycle (real Postgres)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let server: Parameters<typeof request>[0];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    server = app.getHttpServer() as Parameters<typeof request>[0];
    dataSource = moduleRef.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await partnerIdTracker.cleanup(dataSource);
  });

  async function createOrder(
    payload: ReturnType<typeof createOrderPayload>,
  ): Promise<OrderBody> {
    const response = await request(server)
      .post('/orders')
      .set('Idempotency-Key', randomUUID())
      .send(payload)
      .expect(201);
    return response.body as OrderBody;
  }

  async function auditRowsFor(orderId: string): Promise<AuditRow[]> {
    return dataSource.query(
      `SELECT previous_status, new_status, changed_by
       FROM order_status_audit
       WHERE order_id = $1
       ORDER BY created_at ASC`,
      [orderId],
    );
  }

  it('supports the full POST -> GET -> PATCH lifecycle against the real database', async () => {
    const payload = createOrderPayload();

    const created = await request(server)
      .post('/orders')
      .set('Idempotency-Key', randomUUID())
      .send(payload)
      .expect(201);
    const order = created.body as OrderBody;
    expect(order.status).toBe('received');

    const fetched = await request(server)
      .get(`/orders/${order.id}`)
      .expect(200);
    expect((fetched.body as OrderBody).id).toBe(order.id);
    expect((fetched.body as OrderBody).status).toBe('received');

    const patched = await request(server)
      .patch(`/orders/${order.id}/status`)
      .send({ status: 'accepted' })
      .expect(200);
    expect((patched.body as OrderBody).status).toBe('accepted');

    // The GET afterward confirms the PATCH's effect actually persisted,
    // not just that the PATCH response claimed it did.
    const refetched = await request(server)
      .get(`/orders/${order.id}`)
      .expect(200);
    expect((refetched.body as OrderBody).status).toBe('accepted');
  });

  it('creates two independent orders for two partners sharing the same Idempotency-Key (SPEC.md §2 cross-tenant scoping)', async () => {
    const idempotencyKey = randomUUID();
    const partnerAPayload = createOrderPayload();
    const partnerBPayload = createOrderPayload();

    const orderA = await request(server)
      .post('/orders')
      .set('Idempotency-Key', idempotencyKey)
      .send(partnerAPayload)
      .expect(201);
    const orderB = await request(server)
      .post('/orders')
      .set('Idempotency-Key', idempotencyKey)
      .send(partnerBPayload)
      .expect(201);

    expect((orderA.body as OrderBody).id).not.toBe(
      (orderB.body as OrderBody).id,
    );

    // Row count, not just the HTTP responses — proves the composite
    // (partnerId, idempotencyKey) constraint actually created two rows,
    // not that the API merely claimed to.
    const rows = await dataSource.query<Array<{ count: number }>>(
      'SELECT count(*)::int AS count FROM orders WHERE idempotency_key = $1',
      [idempotencyKey],
    );
    expect(rows[0]?.count).toBe(2);
  });

  it('writes an audit row on every status change, including both cancelled paths', async () => {
    const acceptedToCancelled = await createOrder(createOrderPayload());
    await request(server)
      .patch(`/orders/${acceptedToCancelled.id}/status`)
      .send({ status: 'accepted' })
      .expect(200);
    await request(server)
      .patch(`/orders/${acceptedToCancelled.id}/status`)
      .send({ status: 'cancelled' })
      .expect(200);

    expect(await auditRowsFor(acceptedToCancelled.id)).toEqual([
      {
        previous_status: null,
        new_status: 'received',
        changed_by: acceptedToCancelled.partnerId,
      },
      {
        previous_status: 'received',
        new_status: 'accepted',
        changed_by: 'system',
      },
      {
        previous_status: 'accepted',
        new_status: 'cancelled',
        changed_by: 'system',
      },
    ]);

    const inProgressToCancelled = await createOrder(createOrderPayload());
    await request(server)
      .patch(`/orders/${inProgressToCancelled.id}/status`)
      .send({ status: 'accepted' })
      .expect(200);
    await request(server)
      .patch(`/orders/${inProgressToCancelled.id}/status`)
      .send({ status: 'in_progress' })
      .expect(200);
    await request(server)
      .patch(`/orders/${inProgressToCancelled.id}/status`)
      .send({ status: 'cancelled' })
      .expect(200);

    expect(await auditRowsFor(inProgressToCancelled.id)).toEqual([
      {
        previous_status: null,
        new_status: 'received',
        changed_by: inProgressToCancelled.partnerId,
      },
      {
        previous_status: 'received',
        new_status: 'accepted',
        changed_by: 'system',
      },
      {
        previous_status: 'accepted',
        new_status: 'in_progress',
        changed_by: 'system',
      },
      {
        previous_status: 'in_progress',
        new_status: 'cancelled',
        changed_by: 'system',
      },
    ]);
  });

  it('returns 409 for accepted -> rejected and in_progress -> rejected (rejected is only reachable from received)', async () => {
    const fromAccepted = await createOrder(createOrderPayload());
    await request(server)
      .patch(`/orders/${fromAccepted.id}/status`)
      .send({ status: 'accepted' })
      .expect(200);

    const acceptedToRejected = await request(server)
      .patch(`/orders/${fromAccepted.id}/status`)
      .send({ status: 'rejected' })
      .expect(409);
    expect(acceptedToRejected.body).toMatchObject({
      from: 'accepted',
      to: 'rejected',
    });

    const fromInProgress = await createOrder(createOrderPayload());
    await request(server)
      .patch(`/orders/${fromInProgress.id}/status`)
      .send({ status: 'accepted' })
      .expect(200);
    await request(server)
      .patch(`/orders/${fromInProgress.id}/status`)
      .send({ status: 'in_progress' })
      .expect(200);

    const inProgressToRejected = await request(server)
      .patch(`/orders/${fromInProgress.id}/status`)
      .send({ status: 'rejected' })
      .expect(409);
    expect(inProgressToRejected.body).toMatchObject({
      from: 'in_progress',
      to: 'rejected',
    });
  });
});
