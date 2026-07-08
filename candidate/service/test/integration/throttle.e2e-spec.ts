import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { createPartnerIdTracker } from './support/partner-id-tracker';

// Deliberately its own file/app instance (its own in-memory throttler
// storage) so its request volume can't push any other suite's mutating
// requests over the 20/60s limit, and vice versa.
// Real Postgres container required (see candidate/service/CLAUDE.md).
describe('Rate limiting (real Postgres)', () => {
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

  const partnerIdTracker = createPartnerIdTracker();

  afterEach(async () => {
    await partnerIdTracker.cleanup(dataSource);
  });

  function createOrderPayload() {
    return {
      partnerId: partnerIdTracker.track(randomUUID()),
      patientReference: 'PT-2026-00417',
      requestedLocation: 'Lagos Diagnostics, Ikeja',
      priority: 'routine',
    };
  }

  it('throttles POST /orders (a mutating endpoint) past 20 requests/minute per IP', async () => {
    const statusCodes: number[] = [];
    for (let i = 0; i < 25; i += 1) {
      const response = await request(server)
        .post('/orders')
        .set('Idempotency-Key', randomUUID())
        .send(createOrderPayload());
      statusCodes.push(response.status);
    }

    expect(statusCodes).toContain(429);
    expect(
      statusCodes.filter((code) => code === 201).length,
    ).toBeLessThanOrEqual(20);
  });

  it('does not throttle GET /orders (a read endpoint)', async () => {
    // Sequential, not concurrent: this is testing @SkipThrottle()'s
    // effect, not the server's ability to handle a concurrency burst.
    for (let i = 0; i < 25; i += 1) {
      await request(server).get('/orders').expect(200);
    }
  });
});
