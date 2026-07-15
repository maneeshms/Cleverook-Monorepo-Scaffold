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
  // FCM push (Android + iOS via APNs relay + Web): the Firebase service-account
  // JSON, raw or base64-encoded. Empty ⇒ PUSH routes to console-push.
  fcm: {
    serviceAccountJson: process.env.FCM_SERVICE_ACCOUNT_JSON ?? '',
  },
  // Route resolution order: DB route row → this override → default
  // (fcm when a service account is present, else console-push).
  pushProviderOverride: process.env.MESSAGING_PUSH_PROVIDER ?? '',
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

export const featureFlagsConfig = registerAs('featureFlags', () => ({
  // Which OpenFeature provider backs flag evaluation. 'env' reads FF_<KEY> vars;
  // 'database' reads the feature_flags table. Swap for a hosted provider
  // (LaunchDarkly, Flagsmith, ...) later without touching call sites.
  provider: (process.env.FEATURE_FLAG_PROVIDER ?? 'env').toLowerCase(),
  // How long the database provider caches flags in memory before re-reading.
  // Explicit NaN check (not `|| 30000`) so a configured 0 (caching disabled) is
  // preserved; only invalid/missing input falls back to the default.
  cacheTtlMs: ((v) => (Number.isFinite(v) && v >= 0 ? v : 30000))(
    parseInt(process.env.FEATURE_FLAG_CACHE_TTL_MS ?? '30000', 10),
  ),
}));

export const complianceConfig = registerAs('compliance', () => {
  const int = (raw: string | undefined, fallback: number) => {
    const n = parseInt(raw ?? '', 10);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    // HMAC key for the tamper-evident audit hash chain. Falls back to
    // JWT_ACCESS_SECRET so the app boots, but set a DEDICATED key in prod — the
    // chain's integrity guarantee is only as strong as this secret staying secret.
    auditHmacSecret: process.env.AUDIT_HMAC_SECRET || process.env.JWT_ACCESS_SECRET || '',
    // Retention windows in days (GDPR storage-limitation). 0 or less = keep forever.
    retention: {
      auditLogDays: int(process.env.RETENTION_AUDIT_LOG_DAYS, 365),
      softDeletedUserGraceDays: int(process.env.RETENTION_SOFT_DELETED_USER_DAYS, 30),
      notificationDays: int(process.env.RETENTION_NOTIFICATION_DAYS, 180),
      messageDeliveryDays: int(process.env.RETENTION_MESSAGE_DELIVERY_DAYS, 90),
      // FCM guidance: treat tokens unseen for >270 days as stale.
      deviceTokenDays: int(process.env.RETENTION_DEVICE_TOKEN_DAYS, 270),
    },
    // Run the built-in daily retention cron. Set to 'false' to drive it externally.
    retentionCron: (process.env.RETENTION_CRON ?? 'true').toLowerCase() !== 'false',
  };
});
