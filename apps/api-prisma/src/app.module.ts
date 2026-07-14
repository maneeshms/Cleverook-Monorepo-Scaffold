import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import {
  appConfig,
  createEnvValidator,
  throttleConfig,
  // clevscaffold:auth:start
  jwtConfig,
  // clevscaffold:auth:end
  // clevscaffold:metrics:start
  metricsConfig,
  // clevscaffold:metrics:end
} from '@clevrook/config';
import { LoggerModule } from '@clevrook/logger';
import {
  AllExceptionsFilter,
  LoggingInterceptor,
  RedisModule,
  REDIS_CLIENT,
  redisThrottlerStorage,
  // clevscaffold:auth:start
  JwtAuthGuard,
  RolesGuard,
  // clevscaffold:auth:end
  // clevscaffold:metrics:start
  MetricsModule,
  // clevscaffold:metrics:end
} from '@clevrook/common';
import { PrismaModule } from './prisma/prisma.module';
// clevscaffold:auth:start
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
// clevscaffold:auth:end
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      ignoreEnvFile: true, // the layered loader owns .env + config/*.json
      load: [
        appConfig,
        throttleConfig,
        // clevscaffold:auth:start
        jwtConfig,
        // clevscaffold:auth:end
        // clevscaffold:metrics:start
        metricsConfig,
        // clevscaffold:metrics:end
      ],
      validate: createEnvValidator({
        configDir: process.env.CONFIG_DIR ?? join(process.cwd(), 'apps/api-prisma/config'),
        require: [
          'PRISMA_DATABASE_URL',
          // clevscaffold:auth:start
          'JWT_ACCESS_SECRET',
          'JWT_REFRESH_SECRET',
          // clevscaffold:auth:end
        ],
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
    // clevscaffold:metrics:start
    MetricsModule,
    // clevscaffold:metrics:end
    PrismaModule,
    // clevscaffold:auth:start
    AuthModule,
    UsersModule,
    // clevscaffold:auth:end
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // clevscaffold:auth:start
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // clevscaffold:auth:end
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
