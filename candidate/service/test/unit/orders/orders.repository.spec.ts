import { QueryFailedError, type Repository } from 'typeorm';

import type { Order } from '../../../src/orders/entities/order.entity';
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
  let create: jest.Mock;
  let insert: jest.Mock;
  let findOneByOrFail: jest.Mock;
  let repository: OrdersRepository;

  beforeEach(() => {
    create = jest.fn((input: CreateOrderInput) => ({ ...input }) as Order);
    insert = jest.fn().mockResolvedValue(undefined);
    findOneByOrFail = jest.fn();

    const typeOrmRepository = {
      create,
      insert,
      findOneByOrFail,
    } as unknown as Repository<Order>;

    repository = new OrdersRepository(typeOrmRepository);
  });

  it('inserts a new order when the idempotency key is unused', async () => {
    const input = buildInput();

    const result = await repository.insertIdempotent(input);

    expect(result.isNew).toBe(true);
    expect(result.order).toMatchObject(input);
    expect(findOneByOrFail).not.toHaveBeenCalled();
  });

  it('returns the existing order on a same-partner, same-key replay', async () => {
    const input = buildInput();
    const existing = {
      ...input,
      id: 'existing-id',
      status: 'accepted',
    } as Order;
    insert.mockRejectedValueOnce(uniqueViolation('idx_orders_idempotency_key'));
    findOneByOrFail.mockResolvedValueOnce(existing);

    const result = await repository.insertIdempotent(input);

    expect(result.isNew).toBe(false);
    expect(result.order).toBe(existing);
    expect(findOneByOrFail).toHaveBeenCalledWith({
      partnerId: input.partnerId,
      idempotencyKey: input.idempotencyKey,
    });
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
    insert.mockRejectedValueOnce(uniqueViolation('idx_orders_idempotency_key'));
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
    insert.mockRejectedValueOnce(uniqueViolation('orders_pkey'));

    await expect(repository.insertIdempotent(input)).rejects.toThrow(
      QueryFailedError,
    );
    expect(findOneByOrFail).not.toHaveBeenCalled();
  });

  it('rethrows a non-QueryFailedError unchanged', async () => {
    const input = buildInput();
    const unexpected = new Error('connection reset');
    insert.mockRejectedValueOnce(unexpected);

    await expect(repository.insertIdempotent(input)).rejects.toBe(unexpected);
    expect(findOneByOrFail).not.toHaveBeenCalled();
  });
});
