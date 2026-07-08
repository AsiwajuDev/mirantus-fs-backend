import { Injectable } from '@nestjs/common';

import { Order } from './entities/order.entity';
import type { OrderStatus } from './order-status.enum';
import { OrdersRepository } from './orders.repository';
import { TransitionGuard } from './transition-guard';

@Injectable()
export class OrdersService {
  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly transitionGuard: TransitionGuard,
  ) {}

  async updateStatus(
    order: Order,
    next: OrderStatus,
    changedBy: string,
  ): Promise<Order> {
    this.transitionGuard.assertValid(order.status, next);
    return this.ordersRepository.applyStatusTransition(order, next, changedBy);
  }
}
