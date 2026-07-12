import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import {
  appConfig,
  createEnvValidator,
  databaseConfig,
  featureFlagsConfig,
  jwtConfig,
  messagingConfig,
  metricsConfig,
  throttleConfig,
} from '@clevscaffold/config';
import { DatabaseModule } from '@clevscaffold/database';
import { LoggerModule } from '@clevscaffold/logger';
import { MessagingModule } from '@clevscaffold/messaging';
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
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { FeatureFlagsModule } from './modules/feature-flags/feature-flags.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { InAppSinkModule } from './modules/notifications/in-app-sink.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // The layered loader owns .env + config/*.json resolution — see
      // libs/config/src/layered-config.ts and docs/CONFIGURATION.md.
      ignoreEnvFile: true,
      load: [
        appConfig,
        databaseConfig,
        jwtConfig,
        throttleConfig,
        messagingConfig,
        metricsConfig,
        featureFlagsConfig,
      ],
      validate: createEnvValidator({
        configDir: process.env.CONFIG_DIR ?? join(process.cwd(), 'apps/api/config'),
        require: ['DATABASE_URL'],
      }),
    }),
    // Enables @Cron jobs (e.g. expired-session purge). See docs/ROADMAP.md for
    // scaling scheduled work across a fleet.
    ScheduleModule.forRoot(),
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
        // Redis-backed storage makes limits global across instances; falls back
        // to in-memory (single-instance) when Redis is not configured.
        storage: redisThrottlerStorage(redis),
        // Escape hatch for e2e/load harnesses: throttling stays ON unless a test
        // explicitly opts out. Never set THROTTLE_DISABLED in production.
        skipIf: () => process.env.THROTTLE_DISABLED === 'true',
      }),
    }),
    LoggerModule,
    RedisModule,
    DatabaseModule,
    MetricsModule,
    // Omnichannel messaging engine — config injected from this app's
    // ConfigService so the lib stays env-agnostic; the IN_APP channel is backed
    // by this app's notifications feed via InAppSinkModule (IN_APP_SINK token).
    MessagingModule.forRootAsync({
      imports: [InAppSinkModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        encryptionKey:
          config.get<string>('messaging.encryptionKey') ||
          config.get<string>('jwt.accessSecret') ||
          '',
        redisUrl: config.get<string>('REDIS_URL') ?? null,
        resend: {
          apiKey: config.get<string>('messaging.resend.apiKey'),
          fromEmail: config.get<string>('messaging.resend.fromEmail'),
          fromName: config.get<string>('messaging.resend.fromName'),
        },
        emailProviderOverride: config.get<string>('messaging.emailProviderOverride') ?? null,
      }),
    }),
    AuthModule,
    UsersModule,
    TasksModule,
    FeatureFlagsModule,
    NotificationsModule,
    HealthModule,
  ],
  providers: [
    // Guard chain (order matters): Throttle → JwtAuth → Roles.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
