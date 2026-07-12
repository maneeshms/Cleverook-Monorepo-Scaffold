import { NodeEnv, validateEnv } from './env.validation';

const baseEnv = {
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
};

describe('validateEnv', () => {
  it('accepts a minimal valid configuration and applies defaults', () => {
    const result = validateEnv({ ...baseEnv });
    expect(result.NODE_ENV).toBe(NodeEnv.Development);
    expect(result.PORT).toBe(3000);
    expect(result.BCRYPT_ROUNDS).toBe(12);
    expect(result.THROTTLE_TTL).toBe(60);
    expect(result.THROTTLE_LIMIT).toBe(120);
    expect(result.DATABASE_SSL).toBe('disable');
    expect(result.DATABASE_POOL_MAX).toBe(20);
    expect(result.CORS_ORIGINS).toBe('*');
    expect(result.JWT_ACCESS_TTL).toBe('15m');
    expect(result.JWT_REFRESH_TTL).toBe('30d');
    expect(result.LOG_LEVEL).toBe('info');
    expect(result.METRICS_ENABLED).toBe('true');
  });

  it('coerces numeric strings (env vars are strings)', () => {
    const result = validateEnv({
      ...baseEnv,
      PORT: '3010',
      BCRYPT_ROUNDS: '10',
      THROTTLE_TTL: '30',
      THROTTLE_LIMIT: '50',
      DATABASE_POOL_MAX: '5',
    });
    expect(result.PORT).toBe(3010);
    expect(result.BCRYPT_ROUNDS).toBe(10);
    expect(result.THROTTLE_TTL).toBe(30);
    expect(result.THROTTLE_LIMIT).toBe(50);
    expect(result.DATABASE_POOL_MAX).toBe(5);
  });

  it('rejects a missing JWT_ACCESS_SECRET', () => {
    expect(() => validateEnv({ JWT_REFRESH_SECRET: 'b'.repeat(40) })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it('rejects short JWT secrets', () => {
    expect(() =>
      validateEnv({ JWT_ACCESS_SECRET: 'short', JWT_REFRESH_SECRET: 'b'.repeat(40) }),
    ).toThrow(/at least 32 characters/);
  });

  it('rejects an invalid NODE_ENV', () => {
    expect(() => validateEnv({ ...baseEnv, NODE_ENV: 'staging' })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => validateEnv({ ...baseEnv, PORT: 'not-a-port' })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('treats empty-string values as unset so defaults apply', () => {
    const result = validateEnv({ ...baseEnv, PORT: '', LOG_LEVEL: '' });
    expect(result.PORT).toBe(3000);
    expect(result.LOG_LEVEL).toBe('info');
  });

  it('accepts every NODE_ENV enum member', () => {
    for (const env of [NodeEnv.Development, NodeEnv.Production, NodeEnv.Test]) {
      expect(validateEnv({ ...baseEnv, NODE_ENV: env }).NODE_ENV).toBe(env);
    }
  });

  it('keeps optional keys undefined when unset', () => {
    const result = validateEnv({ ...baseEnv });
    expect(result.DATABASE_URL).toBeUndefined();
    expect(result.PRISMA_DATABASE_URL).toBeUndefined();
    expect(result.REDIS_URL).toBeUndefined();
    expect(result.METRICS_TOKEN).toBeUndefined();
  });
});
