import {
  appConfig,
  complianceConfig,
  databaseConfig,
  featureFlagsConfig,
  jwtConfig,
  messagingConfig,
  metricsConfig,
  throttleConfig,
} from './configuration';

describe('configuration namespaces', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('appConfig', () => {
    it('applies defaults', () => {
      delete process.env.PORT;
      delete process.env.CORS_ORIGINS;
      delete process.env.BCRYPT_ROUNDS;
      delete process.env.NODE_ENV;
      const cfg = appConfig();
      expect(cfg.env).toBe('development');
      expect(cfg.port).toBe(3000);
      expect(cfg.corsOrigins).toEqual(['*']);
      expect(cfg.bcryptRounds).toBe(12);
    });

    it('splits and trims the CORS allowlist', () => {
      process.env.CORS_ORIGINS = ' https://a.example.com , https://b.example.com ,';
      expect(appConfig().corsOrigins).toEqual(['https://a.example.com', 'https://b.example.com']);
    });
  });

  describe('complianceConfig', () => {
    it('applies retention defaults and falls back to JWT secret for the HMAC key', () => {
      for (const k of [
        'AUDIT_HMAC_SECRET',
        'RETENTION_AUDIT_LOG_DAYS',
        'RETENTION_SOFT_DELETED_USER_DAYS',
        'RETENTION_NOTIFICATION_DAYS',
        'RETENTION_MESSAGE_DELIVERY_DAYS',
        'RETENTION_CRON',
      ]) {
        delete process.env[k];
      }
      process.env.JWT_ACCESS_SECRET = 'jwt-secret-fallback';
      const cfg = complianceConfig();
      expect(cfg.auditHmacSecret).toBe('jwt-secret-fallback');
      expect(cfg.retention).toEqual({
        auditLogDays: 365,
        softDeletedUserGraceDays: 30,
        notificationDays: 180,
        messageDeliveryDays: 90,
      });
      expect(cfg.retentionCron).toBe(true);
    });

    it('honours explicit windows, a dedicated key, and disables the cron', () => {
      process.env.AUDIT_HMAC_SECRET = 'dedicated';
      process.env.RETENTION_AUDIT_LOG_DAYS = '30';
      process.env.RETENTION_NOTIFICATION_DAYS = 'not-a-number';
      process.env.RETENTION_CRON = 'false';
      const cfg = complianceConfig();
      expect(cfg.auditHmacSecret).toBe('dedicated');
      expect(cfg.retention.auditLogDays).toBe(30);
      expect(cfg.retention.notificationDays).toBe(180); // invalid → default
      expect(cfg.retentionCron).toBe(false);
    });
  });

  describe('databaseConfig', () => {
    it('defaults to ssl disabled', () => {
      delete process.env.DATABASE_SSL;
      expect(databaseConfig().ssl).toBe(false);
    });

    it("maps 'require' to full TLS verification", () => {
      process.env.DATABASE_SSL = 'require';
      expect(databaseConfig().ssl).toBe(true);
    });

    it("maps 'no-verify' to TLS without CA verification (Supabase-style)", () => {
      process.env.DATABASE_SSL = 'no-verify';
      expect(databaseConfig().ssl).toEqual({ rejectUnauthorized: false });
    });

    it("accepts legacy 'true' as no-verify", () => {
      process.env.DATABASE_SSL = 'true';
      expect(databaseConfig().ssl).toEqual({ rejectUnauthorized: false });
    });

    it('never enables synchronize and exposes pool sizing', () => {
      process.env.DATABASE_POOL_MAX = '7';
      const cfg = databaseConfig();
      expect(cfg.synchronize).toBe(false);
      expect(cfg.poolMax).toBe(7);
    });

    it('defaults the pool size and reads the URL', () => {
      delete process.env.DATABASE_POOL_MAX;
      process.env.DATABASE_URL = 'postgresql://u:p@h:5432/db';
      const cfg = databaseConfig();
      expect(cfg.poolMax).toBe(20);
      expect(cfg.url).toBe('postgresql://u:p@h:5432/db');
    });

    it('only logs SQL in development', () => {
      process.env.NODE_ENV = 'production';
      expect(databaseConfig().logging).toBe(false);
      process.env.NODE_ENV = 'development';
      expect(databaseConfig().logging).toBe(true);
    });
  });

  describe('jwtConfig', () => {
    it('honours explicit TTL overrides', () => {
      process.env.JWT_ACCESS_TTL = '5m';
      process.env.JWT_REFRESH_TTL = '7d';
      const cfg = jwtConfig();
      expect(cfg.accessTtl).toBe('5m');
      expect(cfg.refreshTtl).toBe('7d');
    });

    it('reads secrets and TTL defaults', () => {
      process.env.JWT_ACCESS_SECRET = 'access-secret';
      process.env.JWT_REFRESH_SECRET = 'refresh-secret';
      delete process.env.JWT_ACCESS_TTL;
      delete process.env.JWT_REFRESH_TTL;
      const cfg = jwtConfig();
      expect(cfg.accessSecret).toBe('access-secret');
      expect(cfg.refreshSecret).toBe('refresh-secret');
      expect(cfg.accessTtl).toBe('15m');
      expect(cfg.refreshTtl).toBe('30d');
    });
  });

  describe('throttleConfig', () => {
    it('parses ttl/limit with defaults', () => {
      delete process.env.THROTTLE_TTL;
      process.env.THROTTLE_LIMIT = '200';
      const cfg = throttleConfig();
      expect(cfg.ttl).toBe(60);
      expect(cfg.limit).toBe(200);
    });
  });

  describe('messagingConfig', () => {
    it('applies defaults and reads the Resend fallback', () => {
      delete process.env.APP_PUBLIC_URL;
      process.env.RESEND_API_KEY = 're_123';
      process.env.RESEND_FROM_EMAIL = 'noreply@x.dev';
      delete process.env.RESEND_FROM_NAME;
      delete process.env.MESSAGING_EMAIL_PROVIDER;
      delete process.env.MESSAGING_ENCRYPTION_KEY;
      const cfg = messagingConfig();
      expect(cfg.appPublicUrl).toBe('http://localhost:5173');
      expect(cfg.resend.apiKey).toBe('re_123');
      expect(cfg.resend.fromEmail).toBe('noreply@x.dev');
      expect(cfg.resend.fromName).toBe('ClevScaffold');
      expect(cfg.emailProviderOverride).toBe('');
      expect(cfg.encryptionKey).toBe('');
    });
  });

  describe('metricsConfig', () => {
    it('is enabled by default', () => {
      delete process.env.METRICS_ENABLED;
      delete process.env.METRICS_TOKEN;
      const cfg = metricsConfig();
      expect(cfg.enabled).toBe(true);
      expect(cfg.token).toBe('');
    });

    it("disables only on the explicit string 'false'", () => {
      process.env.METRICS_ENABLED = 'false';
      expect(metricsConfig().enabled).toBe(false);
      process.env.METRICS_ENABLED = 'anything-else';
      expect(metricsConfig().enabled).toBe(true);
    });

    it('reads the optional bearer token', () => {
      process.env.METRICS_TOKEN = 'metrics-secret';
      expect(metricsConfig().token).toBe('metrics-secret');
    });
  });

  describe('featureFlagsConfig', () => {
    it('defaults to the env provider and a 30s cache TTL', () => {
      delete process.env.FEATURE_FLAG_PROVIDER;
      delete process.env.FEATURE_FLAG_CACHE_TTL_MS;
      const cfg = featureFlagsConfig();
      expect(cfg.provider).toBe('env');
      expect(cfg.cacheTtlMs).toBe(30000);
    });

    it('lowercases the provider name', () => {
      process.env.FEATURE_FLAG_PROVIDER = 'Database';
      expect(featureFlagsConfig().provider).toBe('database');
    });

    it('parses a custom cache TTL and falls back on garbage', () => {
      process.env.FEATURE_FLAG_CACHE_TTL_MS = '5000';
      expect(featureFlagsConfig().cacheTtlMs).toBe(5000);
      process.env.FEATURE_FLAG_CACHE_TTL_MS = 'not-a-number';
      expect(featureFlagsConfig().cacheTtlMs).toBe(30000);
    });
  });
});
