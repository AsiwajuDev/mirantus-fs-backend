import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ORDER_ENTITIES } from './entities';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [TypeOrmModule.forFeature(ORDER_ENTITIES)],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
