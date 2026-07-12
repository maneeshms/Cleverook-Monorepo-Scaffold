import { registerAs } from '@nestjs/config';

/**
 * Typed config namespaces. Inject with @Inject(appConfig.KEY) etc. for
 * compile-time-safe access to validated values instead of reaching into
 * process.env anywhere in app code. Values here are read AFTER the layered
 * loader has merged env > env-file JSON > default JSON into process.env.
 */

export const appConfig = registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  corsOrigins: (process.env.CORS_ORIGINS ?? '*')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10),
}));

/**
 * Database connection — portable across local Docker, self-hosted Postgres,
 * and managed hosts (Supabase, Neon, RDS…).
 * DATABASE_SSL: disable | require | no-verify
 *   - require:   TLS with CA verification (host cert must be trusted)
 *   - no-verify: TLS without CA verification (Supabase/self-signed default)
 *   - 'true' is accepted as a legacy alias of no-verify.
 */
export const databaseConfig = registerAs('database', () => {
  const sslMode = (process.env.DATABASE_SSL ?? 'disable').toLowerCase();
  const ssl =
    sslMode === 'require'
      ? true
      : sslMode === 'no-verify' || sslMode === 'true'
        ? { rejectUnauthorized: false }
        : false;
  return {
    url: process.env.DATABASE_URL,
    ssl,
    poolMax: parseInt(process.env.DATABASE_POOL_MAX ?? '20', 10),
    synchronize: false, // never true — migrations are the source of truth
    logging: process.env.NODE_ENV === 'development',
  };
});

export const jwtConfig = registerAs('jwt', () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET,
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
  refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
}));

export const throttleConfig = registerAs('throttle', () => ({
  ttl: parseInt(process.env.THROTTLE_TTL ?? '60', 10),
  limit: parseInt(process.env.THROTTLE_LIMIT ?? '120', 10),
}));

/**
 * Omnichannel messaging layer. Provider credentials live encrypted in the
 * messaging_provider_configs table; these env vars are the boot-time fallback
 * for the Resend email provider.
 */
export const messagingConfig = registerAs('messaging', () => ({
  appPublicUrl: process.env.APP_PUBLIC_URL ?? 'http://localhost:5173',
  resend: {
    apiKey: process.env.RESEND_API_KEY ?? '',
    fromEmail: process.env.RESEND_FROM_EMAIL ?? '',
    fromName: process.env.RESEND_FROM_NAME ?? 'ClevScaffold',
  },
  // Route resolution order: DB route row → this override → default
  // (resend when an API key is present, else console-email).
  emailProviderOverride: process.env.MESSAGING_EMAIL_PROVIDER ?? '',
  // Key for encrypting DB-stored provider credentials (AES-256-GCM).
  // Falls back to JWT_ACCESS_SECRET — set MESSAGING_ENCRYPTION_KEY in prod.
  encryptionKey: process.env.MESSAGING_ENCRYPTION_KEY ?? '',
}));

/** Prometheus metrics endpoint (libs/common MetricsModule). */
export const metricsConfig = registerAs('metrics', () => ({
  enabled: (process.env.METRICS_ENABLED ?? 'true') !== 'false',
  // Optional bearer token protecting GET /metrics. Empty = unauthenticated
  // (keep the endpoint internal-only at the network layer in that case).
  token: process.env.METRICS_TOKEN ?? '',
}));
