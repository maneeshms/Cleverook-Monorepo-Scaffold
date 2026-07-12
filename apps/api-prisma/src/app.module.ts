import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import {
  appConfig,
  createEnvValidator,
  jwtConfig,
  metricsConfig,
  throttleConfig,
} from '@clevscaffold/config';
import { LoggerModule } from '@clevscaffold/logger';
import {
  AllExceptionsFilter,
  JwtAuthGuard,
  LoggingInterceptor,
  MetricsModule,
  RedisModule,
  REDIS_CLIENT,
  redisThrottlerStorage,
  RolesGuard,
} from '@clevscaffold/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      ignoreEnvFile: true, // the layered loader owns .env + config/*.json
      load: [appConfig, jwtConfig, throttleConfig, metricsConfig],
      validate: createEnvValidator({
        configDir: process.env.CONFIG_DIR ?? join(process.cwd(), 'apps/api-prisma/config'),
        require: ['PRISMA_DATABASE_URL'],
      }),
    }),
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [ConfigService, REDIS_CLIENT],
      useFactory: (config: ConfigService, redis: Redis | null) => ({
        throttlers: [
          {
            ttl: (config.get<number>('throttle.ttl') ?? 60) * 1000,
            limit: config.get<number>('throttle.limit') ?? 120,
          },
        ],
        storage: redisThrottlerStorage(redis),
        skipIf: () => process.env.THROTTLE_DISABLED === 'true',
      }),
    }),
    LoggerModule,
    RedisModule,
    MetricsModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
