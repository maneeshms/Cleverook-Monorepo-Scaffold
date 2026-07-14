// Module + registration
export * from './compliance.module';
export * from './compliance.options';

// Services (public surface)
export * from './audit.service';
export * from './consent.service';
export * from './data-subject.service';
export * from './retention.service';

// Extension points — feature modules contribute through these
export * from './personal-data-registry';

// HTTP surface + validation (host may register its own instead)
export * from './compliance.controller';
export * from './dto/consent.dto';

// Entities — exported so the host can reference them; forFeature registers them,
// the migration lives in @clevrook/database.
export * from './entities/audit-log.entity';
export * from './entities/consent-record.entity';

// Hash-chain primitives (exported for verification tooling/tests)
export * from './hash-chain';
