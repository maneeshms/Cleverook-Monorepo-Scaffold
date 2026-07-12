// Module + registration
export * from './feature-flags.module';
export * from './feature-flags.options';

// Public service surface
export * from './feature-flags.service';

// HTTP surface + validation (host may register its own instead)
export * from './feature-flags.controller';
export * from './dto/upsert-flag.dto';

// Providers + contracts (extend with a hosted backend if needed)
export * from './providers/base-flag.provider';
export * from './providers/env-flag.provider';
export * from './providers/database-flag.provider';

// Entity — exported so the host can reference it if needed (forFeature registers
// it; the feature_flags migration lives in @clevscaffold/database for now).
export * from './entities/feature-flag.entity';
