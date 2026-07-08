import { QueryFailedError, type DataSource, type Repository } from 'typeorm';

import { Order } from '../../../src/orders/entities/order.entity';
import { OrderStatusAudit } from '../../../src/orders/entities/order-status-audit.entity';
import {
  type CreateOrderInput,
  OrdersRepository,
} from '../../../src/orders/orders.repository';

function buildInput(
  overrides: Partial<CreateOrderInput> = {},
): CreateOrderInput {
  return {
    partnerId: 'b3f1c2e4-0000-0000-0000-000000000001',
    patientReference: 'PT-2026-00417',
    requestedLocation: 'Lagos Diagnostics, Ikeja',
    priority: 'routine',
    idempotencyKey: 'c4a2d1e5-0000-0000-0000-000000000099',
    ...overrides,
  };
}

function uniqueViolation(constraint: string): QueryFailedError {
  const driverError = Object.assign(new Error('duplicate key value'), {
    code: '23505',
    constraint,
  });
  return new QueryFailedError('INSERT ...', undefined, driverError);
}

describe('OrdersRepository', () => {
  let orderManagerCreate: jest.Mock;
  let orderManagerInsert: jest.Mock;
  let orderManagerSave: jest.Mock;
  let orderManagerMerge: jest.Mock;
  let auditManagerInsert: jest.Mock;
  let findOneByOrFail: jest.Mock;
  let transaction: jest.Mock;
  let repository: OrdersRepository;

  beforeEach(() => {
    orderManagerCreate = jest.fn(
      (input: CreateOrderInput) => ({ ...input }) as Order,
    );
    orderManagerInsert = jest.fn().mockResolvedValue(undefined);
    orderManagerSave = jest.fn((entity: Order) => Promise.resolve(entity));
    // Mirrors real TypeORM Repository.merge: mutates and returns the
    // first argument in place, preserving its prototype — this is
    // exactly the behavior that matters here (see the bug this
    // replaced: spreading into a plain object silently dropped `Order`'s
    // prototype and, with it, ResponseShapeInterceptor's @Exclude()).
    orderManagerMerge = jest.fn((entity: Order, partial: Partial<Order>) =>
      Object.assign(entity, partial),
    );
    auditManagerInsert = jest.fn().mockResolvedValue(undefined);
    findOneByOrFail = jest.fn();

    const orderManagerRepo = {
      create: orderManagerCreate,
      insert: orderManagerInsert,
      save: orderManagerSave,
      merge: orderManagerMerge,
    };
    const auditManagerRepo = { insert: auditManagerInsert };

    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Order) {
          return orderManagerRepo;
        }
        if (entity === OrderStatusAudit) {
          return auditManagerRepo;
        }
        throw new Error(
          `unexpected entity passed to getRepository: ${String(entity)}`,
        );
      }),
    };

    transaction = jest.fn((work: (manager: unknown) => Promise<unknown>) =>
      work(manager),
    );

    const typeOrmRepository = {
      findOneByOrFail,
    } as unknown as Repository<Order>;

    const dataSource = { transaction } as unknown as DataSource;

    repository = new OrdersRepository(typeOrmRepository, dataSource);
  });

  it('inserts a new order (status received) and writes its creation audit row in one transaction', async () => {
    const input = buildInput();

    const result = await repository.insertIdempotent(input);

    expect(result.isNew).toBe(true);
    expect(result.order).toMatchObject({ ...input, status: 'received' });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(orderManagerInsert).toHaveBeenCalledWith(result.order);
    expect(auditManagerInsert).toHaveBeenCalledWith({
      orderId: result.order.id,
      previousStatus: null,
      newStatus: 'received',
      changedBy: input.partnerId,
    });
    expect(findOneByOrFail).not.toHaveBeenCalled();
  });

  it('returns the existing order on a same-partner, same-key replay', async () => {
    const input = buildInput();
    const existing = {
      ...input,
      id: 'existing-id',
      status: 'accepted',
    } as Order;
    orderManagerInsert.mockRejectedValueOnce(
      uniqueViolation('idx_orders_idempotency_key'),
    );
    findOneByOrFail.mockResolvedValueOnce(existing);

    const result = await repository.insertIdempotent(input);

    expect(result.isNew).toBe(false);
    expect(result.order).toBe(existing);
    expect(findOneByOrFail).toHaveBeenCalledWith({
      partnerId: input.partnerId,
      idempotencyKey: input.idempotencyKey,
    });
    expect(auditManagerInsert).not.toHaveBeenCalled();
  });

  it('returns the existing order (its current state) on a same-key replay with a different body', async () => {
    // SPEC.md §4: idempotency is keyed on (partnerId, idempotencyKey)
    // alone, not the body — a differing body on replay must not change
    // or re-derive the stored row.
    const original = buildInput();
    const replayWithDifferentBody = buildInput({
      patientReference: 'PT-2026-99999',
      requestedLocation: 'A Different Facility',
    });
    const existing = {
      ...original,
      id: 'existing-id',
      status: 'in_progress',
    } as Order;
    orderManagerInsert.mockRejectedValueOnce(
      uniqueViolation('idx_orders_idempotency_key'),
    );
    findOneByOrFail.mockResolvedValueOnce(existing);

    const result = await repository.insertIdempotent(replayWithDifferentBody);

    expect(result.isNew).toBe(false);
    expect(result.order).toBe(existing);
    expect(result.order.patientReference).toBe(original.patientReference);
  });

  it('creates independent orders for two partners sharing the same idempotency key', async () => {
    const partnerAInput = buildInput({ partnerId: 'partner-a' });
    const partnerBInput = buildInput({ partnerId: 'partner-b' });

    const resultA = await repository.insertIdempotent(partnerAInput);
    const resultB = await repository.insertIdempotent(partnerBInput);

    expect(resultA.isNew).toBe(true);
    expect(resultB.isNew).toBe(true);
    expect(resultA.order).not.toBe(resultB.order);
    expect(findOneByOrFail).not.toHaveBeenCalled();
  });

  it('rethrows a unique violation on an unrelated constraint', async () => {
    const input = buildInput();
    orderManagerInsert.mockRejectedValueOnce(uniqueViolation('orders_pkey'));

    await expect(repository.insertIdempotent(input)).rejects.toThrow(
      QueryFailedError,
    );
    expect(findOneByOrFail).not.toHaveBeenCalled();
  });

  it('rethrows a non-QueryFailedError unchanged', async () => {
    const input = buildInput();
    const unexpected = new Error('connection reset');
    orderManagerInsert.mockRejectedValueOnce(unexpected);

    await expect(repository.insertIdempotent(input)).rejects.toBe(unexpected);
    expect(findOneByOrFail).not.toHaveBeenCalled();
  });

  describe('applyStatusTransition', () => {
    function buildOrder(): Order {
      // A real Order instance, not a plain object cast — this is what
      // distinguishes "merge in place" from "spread into a new plain
      // object": only the former keeps the prototype (and therefore
      // ResponseShapeInterceptor's @Exclude() metadata) intact.
      return Object.assign(new Order(), {
        id: 'order-1',
        partnerId: 'partner-a',
        status: 'received',
      });
    }

    it('updates the order in place (merge, not spread) and writes the audit row inside one transaction', async () => {
      const order = buildOrder();

      const result = await repository.applyStatusTransition(
        order,
        'accepted',
        'partner-a',
      );

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(orderManagerMerge).toHaveBeenCalledWith(order, {
        status: 'accepted',
      });
      expect(orderManagerSave).toHaveBeenCalledWith(order);
      expect(auditManagerInsert).toHaveBeenCalledWith({
        orderId: order.id,
        previousStatus: 'received',
        newStatus: 'accepted',
        changedBy: 'partner-a',
      });
      expect(result).toBeInstanceOf(Order);
      expect(result.status).toBe('accepted');
    });

    it('propagates a failure from the audit insert without swallowing it', async () => {
      const auditFailure = new Error('audit insert failed');
      auditManagerInsert.mockRejectedValueOnce(auditFailure);

      await expect(
        repository.applyStatusTransition(buildOrder(), 'accepted', 'partner-a'),
      ).rejects.toBe(auditFailure);
    });
  });

  describe('findById', () => {
    it('delegates to findOneBy', async () => {
      const findOneBy = jest.fn().mockResolvedValue(null);
      const typeOrmRepository = { findOneBy } as unknown as Repository<Order>;
      const repo = new OrdersRepository(typeOrmRepository, {
        transaction,
      } as unknown as DataSource);

      const result = await repo.findById('order-1');

      expect(findOneBy).toHaveBeenCalledWith({ id: 'order-1' });
      expect(result).toBeNull();
    });
  });

  describe('findMany', () => {
    it('builds a filtered, paginated query and returns data + total', async () => {
      const findAndCount = jest.fn().mockResolvedValue([[{ id: 'o-1' }], 1]);
      const typeOrmRepository = {
        findAndCount,
      } as unknown as Repository<Order>;
      const repo = new OrdersRepository(typeOrmRepository, {
        transaction,
      } as unknown as DataSource);

      const result = await repo.findMany(
        { status: 'accepted', partnerId: 'partner-a' },
        { page: 2, pageSize: 20 },
      );

      expect(findAndCount).toHaveBeenCalledWith({
        where: { status: 'accepted', partnerId: 'partner-a' },
        skip: 20,
        take: 20,
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual({ data: [{ id: 'o-1' }], total: 1 });
    });

    it('omits unset filters from the where clause', async () => {
      const findAndCount = jest.fn().mockResolvedValue([[], 0]);
      const typeOrmRepository = {
        findAndCount,
      } as unknown as Repository<Order>;
      const repo = new OrdersRepository(typeOrmRepository, {
        transaction,
      } as unknown as DataSource);

      await repo.findMany({}, { page: 1, pageSize: 20 });

      expect(findAndCount).toHaveBeenCalledWith({
        where: {},
        skip: 0,
        take: 20,
        order: { createdAt: 'DESC' },
      });
    });
  });
});
