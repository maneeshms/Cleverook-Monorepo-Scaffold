import {
  appConfig,
  databaseConfig,
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
      expect(appConfig().corsOrigins).toEqual([
        'https://a.example.com',
        'https://b.example.com',
      ]);
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
});
