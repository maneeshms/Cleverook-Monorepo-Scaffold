import { plainToInstance, Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, MinLength, validateSync } from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/**
 * Validated configuration shape (after the layered loader has merged
 * env > env-file JSON > default JSON). Validation runs once at boot;
 * a malformed value crashes the app immediately rather than failing later.
 *
 * App-specific hard requirements (e.g. DATABASE_URL for the TypeORM app,
 * PRISMA_DATABASE_URL for the Prisma app) are enforced via the `require`
 * option of createEnvValidator, so one shared class serves every app.
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  @IsOptional()
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  PORT = 3000;

  // ── Database ──
  @IsString()
  @IsOptional()
  DATABASE_URL?: string;

  // disable | require | no-verify ('true' accepted as alias of no-verify)
  @IsString()
  @IsOptional()
  DATABASE_SSL = 'disable';

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  DATABASE_POOL_MAX = 20;

  @IsString()
  @IsOptional()
  PRISMA_DATABASE_URL?: string;

  // ── Secrets (environment only — the loader rejects them in JSON layers) ──
  // Optional in the shared class so a core/no-auth app boots without them; apps
  // that include auth enforce presence via createEnvValidator's `require` list.
  // MinLength still applies whenever a value IS provided.
  @IsString()
  @MinLength(32, { message: 'JWT_ACCESS_SECRET must be at least 32 characters' })
  @IsOptional()
  JWT_ACCESS_SECRET?: string;

  @IsString()
  @MinLength(32, { message: 'JWT_REFRESH_SECRET must be at least 32 characters' })
  @IsOptional()
  JWT_REFRESH_SECRET?: string;

  @IsString()
  @IsOptional()
  JWT_ACCESS_TTL = '15m';

  @IsString()
  @IsOptional()
  JWT_REFRESH_TTL = '30d';

  // ── Security ──
  // Comma-separated allowlist, e.g. "https://app.example.com,https://admin.example.com".
  // '*' = wildcard with credentials disabled (dev only).
  @IsString()
  @IsOptional()
  CORS_ORIGINS = '*';

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  BCRYPT_ROUNDS = 12;

  // ── Rate limiting ──
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  THROTTLE_TTL = 60;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  THROTTLE_LIMIT = 120;

  // e2e toggle — read per-request by the ThrottlerModule skipIf.
  @IsString()
  @IsOptional()
  THROTTLE_DISABLED?: string;

  // ── Redis (optional: distributed throttling + async messaging queue) ──
  @IsString()
  @IsOptional()
  REDIS_URL?: string;

  // ── Messaging ──
  @IsString()
  @IsOptional()
  APP_PUBLIC_URL?: string;

  @IsString()
  @IsOptional()
  RESEND_API_KEY?: string;

  @IsString()
  @IsOptional()
  RESEND_FROM_EMAIL?: string;

  @IsString()
  @IsOptional()
  RESEND_FROM_NAME?: string;

  // 'resend' | 'console-email' — overrides the DB-configured route.
  @IsString()
  @IsOptional()
  MESSAGING_EMAIL_PROVIDER?: string;

  // AES-256-GCM key for provider credentials stored in the DB.
  // Falls back to JWT_ACCESS_SECRET when unset — set a dedicated key in prod.
  @IsString()
  @IsOptional()
  MESSAGING_ENCRYPTION_KEY?: string;

  // ── Observability ──
  @IsString()
  @IsOptional()
  METRICS_ENABLED = 'true';

  @IsString()
  @IsOptional()
  METRICS_TOKEN?: string;

  // ── Logging ──
  @IsString()
  @IsOptional()
  LOG_LEVEL = 'info';

  @IsString()
  @IsOptional()
  LOG_DIR = 'logs';

  // File logging is opt-in; default console-only (containers/Railway safe).
  @IsString()
  @IsOptional()
  LOG_TO_FILE?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  // Coerce numeric vars up front so @IsNumber sees numbers regardless of
  // class-transformer's implicit-conversion timing.
  const numericKeys = [
    'PORT',
    'BCRYPT_ROUNDS',
    'THROTTLE_TTL',
    'THROTTLE_LIMIT',
    'DATABASE_POOL_MAX',
  ];
  const coerced: Record<string, unknown> = { ...config };
  // Empty strings mean "unset" (e.g. `VAR=` lines in .env) — drop them so the
  // class defaults apply instead of coercing '' into surprising values.
  for (const [key, value] of Object.entries(coerced)) {
    if (value === '') delete coerced[key];
  }
  for (const key of numericKeys) {
    if (coerced[key] !== undefined) {
      const n = Number(coerced[key]);
      if (!Number.isNaN(n)) coerced[key] = n;
    }
  }

  const validated = plainToInstance(EnvironmentVariables, coerced, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const messages = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('\n  - ');
    throw new Error(`Invalid environment configuration:\n  - ${messages}`);
  }

  return validated;
}
