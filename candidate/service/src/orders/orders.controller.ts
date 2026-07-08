import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { IdempotencyKey } from './decorators/idempotency-key.decorator';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { Order } from './entities/order.entity';
import { OrdersService, type PaginatedOrdersResponse } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @IdempotencyKey() idempotencyKey: string,
    @Body() dto: CreateOrderDto,
  ): Promise<Order> {
    return this.ordersService.createOrder(dto, idempotencyKey);
  }

  @Get()
  findAll(@Query() query: QueryOrdersDto): Promise<PaginatedOrdersResponse> {
    return this.ordersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Order> {
    return this.ordersService.getById(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ): Promise<Order> {
    return this.ordersService.transitionStatus(id, dto.status);
  }
}
