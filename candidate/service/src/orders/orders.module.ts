import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ORDER_ENTITIES } from './entities';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';
import { TransitionGuard } from './transition-guard';

@Module({
  imports: [TypeOrmModule.forFeature(ORDER_ENTITIES)],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository, TransitionGuard],
})
export class OrdersModule {}
