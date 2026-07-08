import type { CreateOrderDto } from '../../../src/orders/dto/create-order.dto';
import { OrdersController } from '../../../src/orders/orders.controller';
import type { OrdersService } from '../../../src/orders/orders.service';

describe('OrdersController', () => {
  let createOrder: jest.Mock;
  let findAll: jest.Mock;
  let getById: jest.Mock;
  let transitionStatus: jest.Mock;
  let controller: OrdersController;

  beforeEach(() => {
    createOrder = jest.fn();
    findAll = jest.fn();
    getById = jest.fn();
    transitionStatus = jest.fn();

    const ordersService = {
      createOrder,
      findAll,
      getById,
      transitionStatus,
    } as unknown as OrdersService;

    controller = new OrdersController(ordersService);
  });

  it('POST /orders delegates to createOrder with the header and body', async () => {
    const dto: CreateOrderDto = {
      partnerId: 'partner-a',
      patientReference: 'PT-2026-00417',
      requestedLocation: 'Lagos Diagnostics, Ikeja',
      priority: 'routine',
    };
    createOrder.mockResolvedValue({ id: 'order-1', ...dto });

    const result = await controller.create('key-1', dto);

    expect(createOrder).toHaveBeenCalledWith(dto, 'key-1');
    expect(result).toEqual({ id: 'order-1', ...dto });
  });

  it('GET /orders delegates to findAll with the query', async () => {
    const query = { page: 1, pageSize: 20 };
    findAll.mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 });

    const result = await controller.findAll(query);

    expect(findAll).toHaveBeenCalledWith(query);
    expect(result).toEqual({ data: [], page: 1, pageSize: 20, total: 0 });
  });

  it('GET /orders/:id delegates to getById', async () => {
    getById.mockResolvedValue({ id: 'order-1' });

    const result = await controller.findOne('order-1');

    expect(getById).toHaveBeenCalledWith('order-1');
    expect(result).toEqual({ id: 'order-1' });
  });

  it('PATCH /orders/:id/status delegates to transitionStatus', async () => {
    transitionStatus.mockResolvedValue({ id: 'order-1', status: 'accepted' });

    const result = await controller.updateStatus('order-1', {
      status: 'accepted',
    });

    expect(transitionStatus).toHaveBeenCalledWith('order-1', 'accepted');
    expect(result).toEqual({ id: 'order-1', status: 'accepted' });
  });
});
