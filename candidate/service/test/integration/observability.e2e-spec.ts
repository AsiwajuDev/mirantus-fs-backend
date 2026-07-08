import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';

interface OpenApiDocument {
  paths: Record<string, unknown>;
  components: {
    schemas: Record<
      string,
      { properties?: Record<string, { enum?: string[] }> }
    >;
  };
}

// Real Postgres container required (see candidate/service/CLAUDE.md).
describe('Observability & docs (real Postgres)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    server = app.getHttpServer() as Parameters<typeof request>[0];
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Swagger', () => {
    it('serves an OpenAPI document at /api-docs-json covering the orders endpoints', async () => {
      const response = await request(server).get('/api-docs-json').expect(200);
      const doc = response.body as OpenApiDocument;

      expect(Object.keys(doc.paths)).toEqual(
        expect.arrayContaining([
          '/orders',
          '/orders/{id}',
          '/orders/{id}/status',
        ]),
      );
    });

    it('reflects the actual validation rules, including the cancelled status value', async () => {
      const response = await request(server).get('/api-docs-json').expect(200);
      const doc = response.body as OpenApiDocument;

      const updateStatusSchema = doc.components.schemas['UpdateOrderStatusDto'];
      expect(updateStatusSchema?.properties?.status?.enum).toContain(
        'cancelled',
      );
    });
  });

  describe('Correlation ID', () => {
    it('echoes an x-correlation-id response header on every request', async () => {
      const response = await request(server).get('/health').expect(200);
      expect(response.headers['x-correlation-id']).toBeDefined();
    });

    it('reuses a client-supplied x-correlation-id rather than generating a new one', async () => {
      const response = await request(server)
        .get('/health')
        .set('x-correlation-id', 'client-supplied-id')
        .expect(200);

      expect(response.headers['x-correlation-id']).toBe('client-supplied-id');
    });

    it('includes correlationId in an error response body', async () => {
      const response = await request(server)
        .get(`/orders/${randomUUID()}`)
        .set('x-correlation-id', 'error-correlation-id')
        .expect(404);

      expect(response.body).toMatchObject({
        correlationId: 'error-correlation-id',
      });
    });
  });

  describe('Security headers & CORS', () => {
    it('applies helmet security headers', async () => {
      const response = await request(server).get('/health').expect(200);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('reflects the configured FRONTEND_ORIGIN in CORS headers', async () => {
      const response = await request(server)
        .get('/health')
        .set('Origin', process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(
        process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
      );
    });

    it('also applies helmet and CORS headers to /api-docs (regression: Swagger must not bypass them)', async () => {
      // Found by @security-auditor: SwaggerModule.setup() mounts a raw
      // Express sub-router that fully handles its own responses, so
      // anything registered *after* it in configure-app.ts never runs
      // for /api-docs*. Fixed by registering helmet()/cors() first.
      const response = await request(server)
        .get('/api-docs')
        .set('Origin', process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173')
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['access-control-allow-origin']).toBe(
        process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
      );
    });
  });
});
