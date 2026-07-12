import { ConfigService } from '@nestjs/config';

interface MockRedisInstance {
  url: string;
  options: unknown;
  handlers: Record<string, (arg?: unknown) => void>;
  on: jest.Mock;
  quit: jest.Mock;
}

const redisInstances: MockRedisInstance[] = [];
jest.mock('ioredis', () => {
  // A real class so `instanceof Redis` checks in downstream packages
  // (@nest-lab/throttler-storage-redis) behave.
  class MockRedis {
    handlers: Record<string, (arg?: unknown) => void> = {};
    on = jest.fn((event: string, cb: (arg?: unknown) => void): MockRedis => {
      this.handlers[event] = cb;
      return this;
    });
    quit = jest.fn().mockResolvedValue('OK');
    constructor(
      public url: string,
      public options: unknown,
    ) {
      redisInstances.push(this as unknown as MockRedisInstance);
    }
  }
  class MockCluster {}
  return { __esModule: true, default: MockRedis, Redis: MockRedis, Cluster: MockCluster };
});

// Import after the mock so RedisService sees the mocked ioredis.
import { RedisModule } from './redis.module';
import { RedisService } from './redis.service';
import { redisThrottlerStorage } from './throttler-storage';

const configService = (values: Record<string, string | undefined>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('RedisService', () => {
  beforeEach(() => redisInstances.splice(0));

  it('holds a null client when REDIS_URL is unset (explicit fallback, no mock redis)', async () => {
    const service = new RedisService(configService({}));
    expect(service.client).toBeNull();
    expect(service.isEnabled()).toBe(false);
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('connects a single shared client when REDIS_URL is set', () => {
    const service = new RedisService(configService({ REDIS_URL: 'redis://localhost:6379' }));
    expect(service.isEnabled()).toBe(true);
    expect(redisInstances).toHaveLength(1);
    expect(redisInstances[0].options).toEqual(
      expect.objectContaining({ maxRetriesPerRequest: null }),
    );
    // error/connect handlers registered and safe to invoke
    redisInstances[0].handlers.error(new Error('nope'));
    redisInstances[0].handlers.connect();
    expect(service.client).toBe(redisInstances[0]);
  });

  it('quits the client on shutdown, swallowing quit failures', async () => {
    const service = new RedisService(configService({ REDIS_URL: 'redis://x' }));
    redisInstances[0].quit.mockRejectedValueOnce(new Error('already closed'));
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    expect(redisInstances[0].quit).toHaveBeenCalled();
  });
});

describe('redisThrottlerStorage', () => {
  it('returns undefined without a client (in-memory throttling)', () => {
    expect(redisThrottlerStorage(null)).toBeUndefined();
  });

  it('returns a Redis-backed storage with a client', () => {
    const service = new RedisService(configService({ REDIS_URL: 'redis://x' }));
    expect(redisThrottlerStorage(service.client)).toBeDefined();
  });
});

describe('RedisModule', () => {
  it('exposes the raw client under the REDIS_CLIENT token', () => {
    const providers = Reflect.getMetadata('providers', RedisModule) as any[];
    const clientProvider = providers.find((p) => p.provide === 'REDIS_CLIENT');
    const service = new RedisService(configService({}));
    expect(clientProvider.useFactory(service)).toBeNull();
    const connected = new RedisService(configService({ REDIS_URL: 'redis://x' }));
    expect(clientProvider.useFactory(connected)).toBe(connected.client);
  });
});
