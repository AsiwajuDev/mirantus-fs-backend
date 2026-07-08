import { randomUUID } from 'node:crypto';

import { DataSource } from 'typeorm';

import { dataSourceOptions } from '../../database/data-source';
import { OrderStatusAudit } from '../../src/orders/entities/order-status-audit.entity';
import { Order } from '../../src/orders/entities/order.entity';
import { OrdersRepository } from '../../src/orders/orders.repository';
import { createPartnerIdTracker } from './support/partner-id-tracker';

// Real Postgres container required (see candidate/service/CLAUDE.md).
// This proves the transactional atomicity itself — a property that only
// exists at the real database level and that mocking the repository
// would hide (per `testing-standards`), not the guard/branching logic
// already covered by the mocked unit tests.
describe('OrdersRepository.applyStatusTransition (real Postgres)', () => {
  let dataSource: DataSource;
  let repository: OrdersRepository;
  const partnerIdTracker = createPartnerIdTracker();

  beforeAll(async () => {
    dataSource = new DataSource(dataSourceOptions);
    await dataSource.initialize();
    repository = new OrdersRepository(
      dataSource.getRepository(Order),
      dataSource,
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  afterEach(async () => {
    await partnerIdTracker.cleanup(dataSource);
  });

  async function insertOrder(): Promise<Order> {
    const orderRepo = dataSource.getRepository(Order);
    return orderRepo.save(
      orderRepo.create({
        partnerId: partnerIdTracker.track(randomUUID()),
        patientReference: 'PT-2026-00417',
        requestedLocation: 'Lagos Diagnostics, Ikeja',
        priority: 'routine',
        status: 'received',
        idempotencyKey: randomUUID(),
      }),
    );
  }

  it('commits both the order update and the audit row together', async () => {
    const order = await insertOrder();

    const result = await repository.applyStatusTransition(
      order,
      'accepted',
      'system',
    );

    expect(result.status).toBe('accepted');

    const reloaded = await dataSource
      .getRepository(Order)
      .findOneByOrFail({ id: order.id });
    expect(reloaded.status).toBe('accepted');

    const auditRows = await dataSource
      .getRepository(OrderStatusAudit)
      .findBy({ orderId: order.id });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      previousStatus: 'received',
      newStatus: 'accepted',
      changedBy: 'system',
    });
  });

  it('rolls back the order status update when the audit insert fails mid-transaction', async () => {
    const order = await insertOrder();

    // `changed_by` is NOT NULL at the DB level (Phase 3 migration) — a
    // genuine constraint violation, not a mocked failure, forcing the
    // real Postgres transaction to abort.
    await expect(
      repository.applyStatusTransition(
        order,
        'accepted',
        null as unknown as string,
      ),
    ).rejects.toThrow();

    const reloaded = await dataSource
      .getRepository(Order)
      .findOneByOrFail({ id: order.id });
    expect(reloaded.status).toBe('received');

    const auditRows = await dataSource
      .getRepository(OrderStatusAudit)
      .findBy({ orderId: order.id });
    expect(auditRows).toHaveLength(0);
  });
});
