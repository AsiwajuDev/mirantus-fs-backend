import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';

import { validateEnv } from './common/config/env.validation';
import { CorrelationMiddleware } from './common/correlation/correlation.middleware';
import { HealthModule } from './health/health.module';
import { ORDER_ENTITIES } from './orders/entities';
import { OrdersModule } from './orders/orders.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validate: validateEnv,
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
    // SPEC.md §7: 20 requests/minute per IP, applied globally (per
    // nestjs-architecture: "new endpoints inherit protection
    // automatically") — read-only endpoints opt out via @SkipThrottle()
    // rather than mutating endpoints opting in.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
    OrdersModule,
    HealthModule,
  ],
  controllers: [],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
