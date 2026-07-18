import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
// clevscaffold:auth:start
import { ScheduleModule } from '@nestjs/schedule';
// clevscaffold:auth:end
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import {
  appConfig,
  createEnvValidator,
  databaseConfig,
  throttleConfig,
  // clevscaffold:auth:start
  jwtConfig,
  // clevscaffold:auth:end
  // clevscaffold:messaging:start
  messagingConfig,
  // clevscaffold:messaging:end
  // clevscaffold:metrics:start
  metricsConfig,
  // clevscaffold:metrics:end
  // clevscaffold:featureflags:start
  featureFlagsConfig,
  // clevscaffold:featureflags:end
  // clevscaffold:compliance:start
  complianceConfig,
  // clevscaffold:compliance:end
} from '@clevrook/config';
import { DatabaseModule } from '@clevrook/database';
// clevscaffold:featureflags:start
import { FeatureFlagsModule } from '@clevrook/feature-flags';
// clevscaffold:featureflags:end
// clevscaffold:compliance:start
import { ComplianceModule } from '@clevrook/compliance';
import { ComplianceWiringModule } from './modules/compliance/compliance-wiring.module';
// clevscaffold:compliance:end
import { LoggerModule } from '@clevrook/logger';
// clevscaffold:messaging:start
import { MessagingModule } from '@clevrook/messaging';
// clevscaffold:messaging:end
// clevscaffold:realtime:start
import { RealtimeModule } from '@clevrook/realtime';
// clevscaffold:realtime:end
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
// clevscaffold:auth:start
import { AuthModule } from '@clevrook/auth';
import { AppAuthService } from './modules/auth/app-auth.service';
import { UsersModule } from './modules/users/users.module';
import { UsersService } from './modules/users/users.service';
// clevscaffold:auth:end
// clevscaffold:tasks:start
import { TasksModule } from './modules/tasks/tasks.module';
// clevscaffold:tasks:end
// clevscaffold:messaging:start
import { NotificationsModule } from './modules/notifications/notifications.module';
import { InAppSinkModule } from './modules/notifications/in-app-sink.module';
// clevscaffold:messaging:end
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
        throttleConfig,
        // clevscaffold:auth:start
        jwtConfig,
        // clevscaffold:auth:end
        // clevscaffold:messaging:start
        messagingConfig,
        // clevscaffold:messaging:end
        // clevscaffold:metrics:start
        metricsConfig,
        // clevscaffold:metrics:end
        // clevscaffold:featureflags:start
        featureFlagsConfig,
        // clevscaffold:featureflags:end
        // clevscaffold:compliance:start
        complianceConfig,
        // clevscaffold:compliance:end
      ],
      validate: createEnvValidator({
        configDir: process.env.CONFIG_DIR ?? join(process.cwd(), 'apps/api/config'),
        require: [
          'DATABASE_URL',
          // clevscaffold:auth:start
          'JWT_ACCESS_SECRET',
          'JWT_REFRESH_SECRET',
          // clevscaffold:auth:end
        ],
      }),
    }),
    // clevscaffold:auth:start
    // Enables @Cron jobs (e.g. expired-session purge). See docs/ROADMAP.md for
    // scaling scheduled work across a fleet.
    ScheduleModule.forRoot(),
    // clevscaffold:auth:end
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
    // clevscaffold:metrics:start
    MetricsModule,
    // clevscaffold:metrics:end
    // clevscaffold:messaging:start
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
        fcm: {
          serviceAccountJson: config.get<string>('messaging.fcm.serviceAccountJson'),
        },
        pushProviderOverride: config.get<string>('messaging.pushProviderOverride') ?? null,
      }),
    }),
    NotificationsModule,
    // clevscaffold:messaging:end
    // clevscaffold:realtime:start
    // Authenticated socket.io channel — clients connect with their access JWT
    // (HS256-verified against the same secret as the REST API) and join a
    // per-user room; features emit via RealtimeService. Redis adapter when
    // REDIS_URL is set (multi-instance fan-out), in-memory otherwise. See
    // docs/REALTIME.md.
    RealtimeModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        accessSecret: config.get<string>('jwt.accessSecret') ?? '',
        redisUrl: config.get<string>('REDIS_URL') ?? null,
      }),
    }),
    // clevscaffold:realtime:end
    // clevscaffold:featureflags:start
    // OpenFeature-backed feature flags — config injected from this app's
    // ConfigService so the lib stays env-agnostic. Swap FEATURE_FLAG_PROVIDER
    // (env | database) or plug a hosted provider without touching call sites.
    FeatureFlagsModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        provider: config.get<string>('featureFlags.provider') ?? 'env',
        cacheTtlMs: config.get<number>('featureFlags.cacheTtlMs'),
        // Route env reads through the layered config loader, not raw process.env.
        envGetter: (key) => config.get<string>(key),
      }),
    }),
    // clevscaffold:featureflags:end
    // clevscaffold:compliance:start
    // Compliance toolkit (audit trail, GDPR export/erasure, consent, retention) —
    // config injected so the lib stays env-agnostic. ComplianceWiringModule
    // registers this app's personal-data contributors + retention targets. See
    // docs/COMPLIANCE.md for the SOC 2 / GDPR / ISO 27001 control mapping.
    ComplianceModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        auditHmacSecret: config.get<string>('compliance.auditHmacSecret') ?? '',
        retention: config.get('compliance.retention'),
        retentionCron: config.get<boolean>('compliance.retentionCron'),
      }),
    }),
    ComplianceWiringModule,
    // clevscaffold:compliance:end
    // clevscaffold:auth:start
    // Reusable auth engine — config injected from this app's ConfigService; the
    // app supplies its user store (UsersService) and its AuthService subclass
    // (AppAuthService: the welcome-email hook). See docs/AUTH.md.
    AuthModule.forRootAsync({
      imports: [UsersModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        accessSecret: config.get<string>('jwt.accessSecret') ?? '',
        accessTtl: config.get<string>('jwt.accessTtl'),
        refreshTtl: config.get<string>('jwt.refreshTtl'),
        bcryptRounds: config.get<number>('app.bcryptRounds'),
      }),
      userStore: UsersService,
      authService: AppAuthService,
    }),
    UsersModule,
    // clevscaffold:auth:end
    // clevscaffold:tasks:start
    TasksModule,
    // clevscaffold:tasks:end
    HealthModule,
  ],
  providers: [
    // Global guards run in registration order; Throttle is always first.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // clevscaffold:auth:start
    // …then the auth chain: JwtAuth (authenticate) → Roles (authorize).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // clevscaffold:auth:end
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
