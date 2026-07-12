import { DynamicModule, Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeatureFlag } from './entities/feature-flag.entity';
import { FeatureFlagsController } from './feature-flags.controller';
import { FEATURE_FLAGS_OPTIONS, FeatureFlagsModuleAsyncOptions } from './feature-flags.options';
import { FeatureFlagsService } from './feature-flags.service';

/**
 * OpenFeature-backed feature flags, as a reusable NestJS library.
 *
 * The host registers it with `FeatureFlagsModule.forRootAsync({...})`, supplying
 * runtime options (provider, cache TTL, env getter) built from its own
 * ConfigService. The library reads no env/app-config itself — that's what keeps it
 * portable across apps and projects. Swap `provider` (env | database) or plug a
 * hosted provider without changing a single call site.
 *
 * Registered global so any module can inject `FeatureFlagsService` and gate
 * behaviour with `flags.isEnabled('key')` without re-importing.
 */
@Global()
@Module({})
export class FeatureFlagsModule {
  static forRootAsync(options: FeatureFlagsModuleAsyncOptions): DynamicModule {
    return {
      module: FeatureFlagsModule,
      global: true,
      imports: [...(options.imports ?? []), TypeOrmModule.forFeature([FeatureFlag])],
      controllers: options.controller === false ? [] : [FeatureFlagsController],
      providers: [
        {
          provide: FEATURE_FLAGS_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        FeatureFlagsService,
      ],
      exports: [FeatureFlagsService],
    };
  }
}
