import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OrdersModule } from './orders/orders.module';
import { ORDER_ENTITIES } from './orders/entities';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        entities: ORDER_ENTITIES,
        synchronize: false,
        poolSize: Number(config.get('DB_POOL_SIZE')) || 10,
      }),
    }),
    OrdersModule,
    HealthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
