import type { Order } from '../../../src/orders/entities/order.entity';
import { InvalidTransitionException } from '../../../src/orders/exceptions/invalid-transition.exception';
import type { OrdersRepository } from '../../../src/orders/orders.repository';
import { OrdersService } from '../../../src/orders/orders.service';
import type { TransitionGuard } from '../../../src/orders/transition-guard';

describe('OrdersService', () => {
  let assertValid: jest.Mock;
  let applyStatusTransition: jest.Mock;
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

    const transitionGuard = { assertValid } as unknown as TransitionGuard;
    const ordersRepository = {
      applyStatusTransition,
    } as unknown as OrdersRepository;

    service = new OrdersService(ordersRepository, transitionGuard);
  });

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
