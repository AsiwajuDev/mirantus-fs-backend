import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';

interface OrderBody {
  id: string;
  partnerId: string;
  patientReference: string;
  requestedLocation: string;
  priority: string;
  status: string;
  idempotencyKey?: string;
}

interface PaginatedOrdersBody {
  data: OrderBody[];
  page: number;
  pageSize: number;
  total: number;
}

interface ErrorBody {
  error: string;
  from?: string;
  to?: string;
}

function createOrderPayload() {
  return {
    partnerId: randomUUID(),
    patientReference: 'PT-2026-00417',
    requestedLocation: 'Lagos Diagnostics, Ikeja',
    priority: 'routine',
  };
}

// Real Postgres container required (see candidate/service/CLAUDE.md).
// Per testing-standards' "Endpoint Coverage": every endpoint needs at
// least one integration test against the real database, not just
// mocked unit tests. Phase 7 adds the deeper, exhaustive scenarios
// (row-count idempotency/cross-tenant assertions, full audit trail,
// rejected-reachability); this covers each endpoint's basic contract.
describe('Orders endpoints (real Postgres)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  // NestJS's own getHttpServer() is typed `any`; a single explicit cast
  // here (not scattered `any`s at every call site) is enough to satisfy
  // supertest's `App` parameter type.
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
    await dataSource.query('DELETE FROM order_status_audit');
    await dataSource.query('DELETE FROM orders');
  });

  async function createOrder(
    payload: ReturnType<typeof createOrderPayload>,
    idempotencyKey: string = randomUUID(),
  ): Promise<OrderBody> {
    const response = await request(server)
      .post('/orders')
      .set('Idempotency-Key', idempotencyKey)
      .send(payload)
      .expect(201);
    return response.body as OrderBody;
  }

  describe('POST /orders', () => {
    it('creates a new order and strips idempotencyKey from the response', async () => {
      const payload = createOrderPayload();

      const response = await request(server)
        .post('/orders')
        .set('Idempotency-Key', randomUUID())
        .send(payload)
        .expect(201);

      const body = response.body as OrderBody;
      expect(body).toMatchObject({
        partnerId: payload.partnerId,
        patientReference: payload.patientReference,
        requestedLocation: payload.requestedLocation,
        priority: payload.priority,
        status: 'received',
      });
      expect(body).not.toHaveProperty('idempotencyKey');
      expect(body.id).toBeDefined();
    });

    it('returns 400 when the Idempotency-Key header is missing', async () => {
      await request(server)
        .post('/orders')
        .send(createOrderPayload())
        .expect(400);
    });

    it('returns 400 for an invalid body field', async () => {
      await request(server)
        .post('/orders')
        .set('Idempotency-Key', randomUUID())
        .send({ ...createOrderPayload(), priority: 'urgent-ish' })
        .expect(400);
    });

    it('replays the same order (same row) for a repeated Idempotency-Key', async () => {
      const idempotencyKey = randomUUID();
      const payload = createOrderPayload();

      const first = await createOrder(payload, idempotencyKey);
      const second = await createOrder(payload, idempotencyKey);

      expect(second.id).toBe(first.id);

      const rows = await dataSource.query<Array<{ count: number }>>(
        'SELECT count(*)::int AS count FROM orders WHERE partner_id = $1',
        [payload.partnerId],
      );
      expect(rows[0]?.count).toBe(1);
    });
  });

  describe('GET /orders/:id', () => {
    it('returns the created order', async () => {
      const created = await createOrder(createOrderPayload());

      const response = await request(server)
        .get(`/orders/${created.id}`)
        .expect(200);

      expect((response.body as OrderBody).id).toBe(created.id);
    });

    it('returns 404 for an unknown (but well-formed) UUID', async () => {
      await request(server).get(`/orders/${randomUUID()}`).expect(404);
    });

    it('returns 400 for a malformed UUID', async () => {
      await request(server).get('/orders/not-a-uuid').expect(400);
    });
  });

  describe('GET /orders', () => {
    it('lists orders filtered by partnerId with pagination metadata', async () => {
      const payload = createOrderPayload();
      await createOrder(payload);

      const response = await request(server)
        .get('/orders')
        .query({ partnerId: payload.partnerId })
        .expect(200);

      const body = response.body as PaginatedOrdersBody;
      expect(body).toMatchObject({ page: 1, pageSize: 20, total: 1 });
      expect(body.data).toHaveLength(1);
    });

    it('returns 400 for an invalid status filter', async () => {
      await request(server)
        .get('/orders')
        .query({ status: 'not-a-real-status' })
        .expect(400);
    });

    it('returns an empty page (not an error) when no orders match the filters', async () => {
      const response = await request(server)
        .get('/orders')
        .query({ partnerId: randomUUID() })
        .expect(200);

      const body = response.body as PaginatedOrdersBody;
      expect(body).toMatchObject({ data: [], page: 1, pageSize: 20, total: 0 });
    });

    it('rejects an unknown query parameter (whitelist: true)', async () => {
      await request(server)
        .get('/orders')
        .query({ notARealFilter: 'x' })
        .expect(400);
    });
  });

  describe('PATCH /orders/:id/status', () => {
    it('applies a valid transition and returns 200', async () => {
      const created = await createOrder(createOrderPayload());

      const response = await request(server)
        .patch(`/orders/${created.id}/status`)
        .send({ status: 'accepted' })
        .expect(200);

      // Regression: applyStatusTransition previously spread the loaded
      // Order into a plain object before save(), dropping its prototype
      // and, with it, ResponseShapeInterceptor's ability to recognize
      // idempotencyKey's @Exclude(). Only a real-Postgres round trip
      // (real Order instances, not hand-built test fixtures) exercises
      // this — a mocked repository test could not have caught it.
      expect(response.body).not.toHaveProperty('idempotencyKey');

      expect((response.body as OrderBody).status).toBe('accepted');
    });

    it('rejects an invalid transition with 409 and from/to fields', async () => {
      const created = await createOrder(createOrderPayload());

      const response = await request(server)
        .patch(`/orders/${created.id}/status`)
        .send({ status: 'completed' })
        .expect(409);

      expect(response.body as ErrorBody).toMatchObject({
        error: 'InvalidTransitionException',
        from: 'received',
        to: 'completed',
      });
    });

    it('returns 400 for an invalid status value before checking whether the order exists', async () => {
      await request(server)
        .patch(`/orders/${randomUUID()}/status`)
        .send({ status: 'not-a-real-status' })
        .expect(400);
    });

    it('returns 404 for a well-formed but unknown order id', async () => {
      await request(server)
        .patch(`/orders/${randomUUID()}/status`)
        .send({ status: 'accepted' })
        .expect(404);
    });
  });
});
