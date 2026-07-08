import { Module } from '@nestjs/common';
import { OrdersModule } from './orders/orders.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [OrdersModule, HealthModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
