import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeatureFlag } from './entities/feature-flag.entity';
import { FeatureFlagsController } from './feature-flags.controller';
import { FeatureFlagsService } from './feature-flags.service';

/**
 * OpenFeature-backed feature flags. Exports FeatureFlagsService so any module can
 * gate behaviour with `flags.isEnabled('key')`. Provider is chosen at boot from
 * FEATURE_FLAG_PROVIDER (env | database) — see docs/CONFIGURATION.md.
 */
@Module({
  imports: [TypeOrmModule.forFeature([FeatureFlag])],
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
