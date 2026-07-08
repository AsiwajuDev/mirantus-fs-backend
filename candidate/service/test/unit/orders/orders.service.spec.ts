import type { Logger } from '@nestjs/common';

import type { CreateOrderDto } from '../../../src/orders/dto/create-order.dto';
import type { Order } from '../../../src/orders/entities/order.entity';
import { InvalidTransitionException } from '../../../src/orders/exceptions/invalid-transition.exception';
import { OrderNotFoundException } from '../../../src/orders/exceptions/order-not-found.exception';
import type { OrdersRepository } from '../../../src/orders/orders.repository';
import { OrdersService } from '../../../src/orders/orders.service';
import type { TransitionGuard } from '../../../src/orders/transition-guard';

function getLogger(service: OrdersService): Logger {
  return (service as unknown as { logger: Logger }).logger;
}

describe('OrdersService', () => {
  let assertValid: jest.Mock;
  let applyStatusTransition: jest.Mock;
  let insertIdempotent: jest.Mock;
  let findMany: jest.Mock;
  let findById: jest.Mock;
  let service: OrdersService;

  const order = {
    id: 'order-1',
    partnerId: 'partner-a',
    status: 'accepted',
  } as Order;

  beforeEach(() => {
    assertValid = jest.fn();
    applyStatusTransition = jest.fn().mockResolvedValue({
      ...order,
      status: 'in_progress',
    });
    insertIdempotent = jest.fn();
    findMany = jest.fn();
    findById = jest.fn();

    const transitionGuard = { assertValid } as unknown as TransitionGuard;
    const ordersRepository = {
      applyStatusTransition,
      insertIdempotent,
      findMany,
      findById,
    } as unknown as OrdersRepository;

    service = new OrdersService(ordersRepository, transitionGuard);
  });

  describe('updateStatus', () => {
    it('validates the transition before delegating to the repository', async () => {
      const result = await service.updateStatus(order, 'in_progress', 'system');

      expect(assertValid).toHaveBeenCalledWith('accepted', 'in_progress');
      expect(applyStatusTransition).toHaveBeenCalledWith(
        order,
        'in_progress',
        'system',
      );
      expect(result).toEqual({ ...order, status: 'in_progress' });
    });

    it('never reaches the repository when the transition is invalid', async () => {
      assertValid.mockImplementation(() => {
        throw new InvalidTransitionException('accepted', 'received');
      });

      await expect(
        service.updateStatus(order, 'received', 'system'),
      ).rejects.toThrow(InvalidTransitionException);
      expect(applyStatusTransition).not.toHaveBeenCalled();
    });
  });

  describe('createOrder', () => {
    const dto: CreateOrderDto = {
      partnerId: 'partner-a',
      patientReference: 'PT-2026-00417',
      requestedLocation: 'Lagos Diagnostics, Ikeja',
      priority: 'routine',
    };

    it('returns the new order without logging on first creation', async () => {
      const loggerWarnSpy = jest
        .spyOn(getLogger(service), 'warn')
        .mockImplementation(() => undefined);
      const created = { ...dto, id: 'order-1', status: 'received' } as Order;
      insertIdempotent.mockResolvedValue({ order: created, isNew: true });

      const result = await service.createOrder(dto, 'key-1');

      expect(insertIdempotent).toHaveBeenCalledWith({
        ...dto,
        idempotencyKey: 'key-1',
      });
      expect(result).toBe(created);
      expect(loggerWarnSpy).not.toHaveBeenCalled();
    });

    it('returns the existing order without warning when a replay body matches', async () => {
      const existing = { ...dto, id: 'order-1', status: 'accepted' } as Order;
      insertIdempotent.mockResolvedValue({ order: existing, isNew: false });
      const loggerWarnSpy = jest
        .spyOn(getLogger(service), 'warn')
        .mockImplementation(() => undefined);

      const result = await service.createOrder(dto, 'key-1');

      expect(result).toBe(existing);
      expect(loggerWarnSpy).not.toHaveBeenCalled();
    });

    it('warns when a replay body differs from the stored order', async () => {
      const existing = {
        ...dto,
        id: 'order-1',
        status: 'accepted',
        patientReference: 'PT-2026-OTHER',
      } as Order;
      insertIdempotent.mockResolvedValue({ order: existing, isNew: false });
      const loggerWarnSpy = jest
        .spyOn(getLogger(service), 'warn')
        .mockImplementation(() => undefined);

      const result = await service.createOrder(dto, 'key-1');

      expect(result).toBe(existing);
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        'Idempotency key replayed with different body',
        { idempotencyKey: 'key-1', partnerId: dto.partnerId },
      );
    });

    // bodyMatches() compares three fields with &&. The mismatch test above
    // only ever differs on patientReference (the first operand), which
    // would still warn even if requestedLocation/priority comparisons were
    // silently dropped from the implementation — that regression would
    // slip through with 100% line coverage but no behavioral coverage.
    // These two isolate a mismatch on each of the other fields.
    it('warns when only requestedLocation differs from the stored order', async () => {
      const existing = {
        ...dto,
        id: 'order-1',
        status: 'accepted',
        requestedLocation: 'A Different Facility',
      } as Order;
      insertIdempotent.mockResolvedValue({ order: existing, isNew: false });
      const loggerWarnSpy = jest
        .spyOn(getLogger(service), 'warn')
        .mockImplementation(() => undefined);

      await service.createOrder(dto, 'key-1');

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        'Idempotency key replayed with different body',
        { idempotencyKey: 'key-1', partnerId: dto.partnerId },
      );
    });

    it('warns when only priority differs from the stored order', async () => {
      const existing = {
        ...dto,
        id: 'order-1',
        status: 'accepted',
        priority: 'urgent',
      } as Order;
      insertIdempotent.mockResolvedValue({ order: existing, isNew: false });
      const loggerWarnSpy = jest
        .spyOn(getLogger(service), 'warn')
        .mockImplementation(() => undefined);

      await service.createOrder(dto, 'key-1');

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        'Idempotency key replayed with different body',
        { idempotencyKey: 'key-1', partnerId: dto.partnerId },
      );
    });
  });

  describe('findAll', () => {
    it('passes through provided filters and pagination', async () => {
      findMany.mockResolvedValue({ data: [order], total: 1 });

      const result = await service.findAll({
        status: 'accepted',
        partnerId: 'partner-a',
        page: 2,
        pageSize: 20,
      });

      expect(findMany).toHaveBeenCalledWith(
        { status: 'accepted', partnerId: 'partner-a' },
        { page: 2, pageSize: 20 },
      );
      expect(result).toEqual({
        data: [order],
        page: 2,
        pageSize: 20,
        total: 1,
      });
    });

    it('omits unset filters rather than passing them as undefined', async () => {
      findMany.mockResolvedValue({ data: [], total: 0 });

      await service.findAll({ page: 1, pageSize: 20 });

      expect(findMany).toHaveBeenCalledWith({}, { page: 1, pageSize: 20 });
    });

    it('clamps an over-large pageSize to the documented maximum instead of rejecting', async () => {
      findMany.mockResolvedValue({ data: [], total: 0 });

      const result = await service.findAll({ page: 1, pageSize: 500 });

      expect(findMany).toHaveBeenCalledWith({}, { page: 1, pageSize: 100 });
      expect(result.pageSize).toBe(100);
    });
  });

  describe('getById', () => {
    it('returns the order when found', async () => {
      findById.mockResolvedValue(order);

      const result = await service.getById(order.id);

      expect(result).toBe(order);
    });

    it('throws OrderNotFoundException when missing', async () => {
      findById.mockResolvedValue(null);

      await expect(service.getById('missing-id')).rejects.toThrow(
        OrderNotFoundException,
      );
    });
  });

  describe('transitionStatus', () => {
    it('looks up the order then validates and delegates the transition', async () => {
      findById.mockResolvedValue(order);

      const result = await service.transitionStatus(order.id, 'in_progress');

      expect(findById).toHaveBeenCalledWith(order.id);
      expect(assertValid).toHaveBeenCalledWith('accepted', 'in_progress');
      expect(applyStatusTransition).toHaveBeenCalledWith(
        order,
        'in_progress',
        'system',
      );
      expect(result).toEqual({ ...order, status: 'in_progress' });
    });

    it('throws OrderNotFoundException before attempting any transition', async () => {
      findById.mockResolvedValue(null);

      await expect(
        service.transitionStatus('missing-id', 'in_progress'),
      ).rejects.toThrow(OrderNotFoundException);
      expect(assertValid).not.toHaveBeenCalled();
      expect(applyStatusTransition).not.toHaveBeenCalled();
    });
  });
});
