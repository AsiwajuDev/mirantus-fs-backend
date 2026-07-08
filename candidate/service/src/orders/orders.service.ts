import { Injectable, Logger } from '@nestjs/common';

import type { CreateOrderDto } from './dto/create-order.dto';
import { MAX_PAGE_SIZE, type QueryOrdersDto } from './dto/query-orders.dto';
import { Order } from './entities/order.entity';
import { OrderNotFoundException } from './exceptions/order-not-found.exception';
import type { OrderStatus } from './order-status.enum';
import { type OrderFilters, OrdersRepository } from './orders.repository';
import { TransitionGuard } from './transition-guard';

export interface PaginatedOrdersResponse {
  data: Order[];
  page: number;
  pageSize: number;
  total: number;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly transitionGuard: TransitionGuard,
  ) {}

  async createOrder(
    dto: CreateOrderDto,
    idempotencyKey: string,
  ): Promise<Order> {
    const { order, isNew } = await this.ordersRepository.insertIdempotent({
      ...dto,
      idempotencyKey,
    });

    if (!isNew && !this.bodyMatches(order, dto)) {
      // SPEC.md §4: idempotency is keyed on (partnerId, idempotencyKey)
      // alone — a differing body on replay still returns the original
      // order as-is, just with a warning noting the mismatch.
      this.logger.warn('Idempotency key replayed with different body', {
        idempotencyKey,
        partnerId: dto.partnerId,
      });
    }

    return order;
  }

  async findAll(query: QueryOrdersDto): Promise<PaginatedOrdersResponse> {
    const page = query.page;
    const pageSize = Math.min(query.pageSize, MAX_PAGE_SIZE);

    const filters: OrderFilters = {};
    if (query.status !== undefined) {
      filters.status = query.status;
    }
    if (query.partnerId !== undefined) {
      filters.partnerId = query.partnerId;
    }

    const { data, total } = await this.ordersRepository.findMany(filters, {
      page,
      pageSize,
    });

    return { data, page, pageSize, total };
  }

  async getById(id: string): Promise<Order> {
    const order = await this.ordersRepository.findById(id);
    if (!order) {
      throw new OrderNotFoundException(id);
    }
    return order;
  }

  async transitionStatus(id: string, next: OrderStatus): Promise<Order> {
    const order = await this.getById(id);
    return this.updateStatus(order, next, 'system');
  }

  async updateStatus(
    order: Order,
    next: OrderStatus,
    changedBy: string,
  ): Promise<Order> {
    this.transitionGuard.assertValid(order.status, next);
    return this.ordersRepository.applyStatusTransition(order, next, changedBy);
  }

  private bodyMatches(order: Order, dto: CreateOrderDto): boolean {
    return (
      order.patientReference === dto.patientReference &&
      order.requestedLocation === dto.requestedLocation &&
      order.priority === dto.priority
    );
  }
}
