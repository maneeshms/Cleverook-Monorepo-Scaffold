import { DynamicModule, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { REALTIME_OPTIONS, RealtimeModuleAsyncOptions } from './realtime.options';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

/**
 * Authenticated socket.io realtime channel as a config-injected library.
 *
 * ```ts
 * RealtimeModule.forRootAsync({
 *   inject: [ConfigService],
 *   useFactory: (config: ConfigService) => ({
 *     accessSecret: config.get('jwt.accessSecret') ?? '',
 *     redisUrl: config.get('REDIS_URL') ?? null,
 *   }),
 * });
 * ```
 *
 * Registered globally so any feature can inject `RealtimeService` (the emit
 * surface) without importing the module — same posture as the other libs.
 */
@Module({})
export class RealtimeModule {
  static forRootAsync(options: RealtimeModuleAsyncOptions): DynamicModule {
    return {
      module: RealtimeModule,
      global: true,
      imports: [...(options.imports ?? []), JwtModule.register({})],
      providers: [
        {
          provide: REALTIME_OPTIONS,
          inject: options.inject ?? [],
          useFactory: options.useFactory,
        },
        RealtimeService,
        RealtimeGateway,
      ],
      exports: [RealtimeService],
    };
  }
}
