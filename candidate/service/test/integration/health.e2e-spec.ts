import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';

// Real Postgres container required (see candidate/service/CLAUDE.md).
describe('Health endpoints (real Postgres)', () => {
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

  it('GET /health returns ok without depending on the database', async () => {
    const response = await request(server).get('/health').expect(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('GET /ready returns ok when the database is reachable', async () => {
    const response = await request(server).get('/ready').expect(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
