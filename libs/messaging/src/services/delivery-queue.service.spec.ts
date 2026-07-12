import { Channel } from '../enums/channel.enum';
import { DeliveryStatus } from '../entities/message-delivery.entity';
import { DeliveryJob, DeliveryQueueService } from './delivery-queue.service';

const mockQueueInstances: any[] = [];
const mockWorkerInstances: any[] = [];
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation((name: string, opts: unknown) => {
    const q = {
      name,
      opts,
      add: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
      handlers: {} as Record<string, (...args: unknown[]) => void>,
    };
    q.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      q.handlers[event] = cb;
      return q;
    });
    mockQueueInstances.push(q);
    return q;
  }),
  Worker: jest.fn().mockImplementation((name: string, processor: unknown, opts: unknown) => {
    const w = {
      name,
      processor,
      opts,
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
      handlers: {} as Record<string, (...args: unknown[]) => void>,
    };
    w.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      w.handlers[event] = cb;
      return w;
    });
    mockWorkerInstances.push(w);
    return w;
  }),
}));

const makeProvider = (key: string, result: { ok: boolean; error?: string }, throws = false) => ({
  key,
  channels: [Channel.EMAIL],
  send: throws
    ? jest.fn().mockRejectedValue(new Error(result.error ?? 'threw'))
    : jest.fn().mockResolvedValue(result),
});

const makeService = ({
  providers = [] as unknown[],
  redisEnabled = false,
  redisUrl = null as string | null,
} = {}) => {
  const deliveries = {
    create: jest.fn((row: unknown) => row),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const logger = { log: jest.fn(), error: jest.fn() };
  const service = new DeliveryQueueService(
    providers as never,
    deliveries as never,
    { encryptionKey: 'k', redisUrl } as never,
    { isEnabled: () => redisEnabled } as never,
    logger as never,
  );
  return { service, deliveries, logger };
};

const job = (overrides: Partial<DeliveryJob> = {}): DeliveryJob => ({
  messageType: 'WELCOME',
  userId: 'u1',
  delivery: { channel: Channel.EMAIL, to: 'alice@example.com', subject: 'Hi' },
  providerKey: 'primary',
  fallbackProviderKey: null,
  ...overrides,
});

beforeEach(() => {
  mockQueueInstances.splice(0);
  mockWorkerInstances.splice(0);
});

describe('DeliveryQueueService — inline mode (no Redis)', () => {
  it('starts without a queue and delivers inline', async () => {
    const primary = makeProvider('primary', { ok: true });
    const { service, deliveries } = makeService({ providers: [primary] });
    service.onModuleInit();
    expect(service.isAsync()).toBe(false);

    await service.enqueue(job());
    expect(primary.send).toHaveBeenCalled();
    expect(deliveries.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: DeliveryStatus.SENT, attempts: 1 }),
    );
  });

  it('falls back to the fallback provider on primary failure', async () => {
    const primary = makeProvider('primary', { ok: false, error: 'quota' });
    const fallback = makeProvider('backup', { ok: true });
    const { service, deliveries } = makeService({ providers: [primary, fallback] });
    await service.enqueue(job({ fallbackProviderKey: 'backup' }));
    expect(fallback.send).toHaveBeenCalled();
    expect(deliveries.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DeliveryStatus.SENT,
        providerKey: 'backup',
        attempts: 2,
      }),
    );
  });

  it('records FAILED and logs when both providers fail', async () => {
    const primary = makeProvider('primary', { ok: false, error: 'quota' });
    const fallback = makeProvider('backup', { ok: false, error: 'also down' }, true);
    const { service, deliveries, logger } = makeService({ providers: [primary, fallback] });
    await service.enqueue(job({ fallbackProviderKey: 'backup' }));
    expect(deliveries.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: DeliveryStatus.FAILED, error: 'also down' }),
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Delivery failed'),
      undefined,
      'Messaging',
    );
  });

  it('fails cleanly when the provider key is not registered', async () => {
    const { service, deliveries } = makeService({ providers: [] });
    await service.enqueue(job({ providerKey: 'ghost' }));
    expect(deliveries.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DeliveryStatus.FAILED,
        error: "Provider 'ghost' not registered",
      }),
    );
  });

  it('masks recipients per channel in the audit row', async () => {
    const primary = makeProvider('primary', { ok: true });
    const { service, deliveries } = makeService({ providers: [primary] });

    await service.enqueue(job());
    expect(deliveries.create).toHaveBeenCalledWith(
      expect.objectContaining({ toMasked: 'a***@example.com' }),
    );

    await service.enqueue(
      job({ delivery: { channel: Channel.EMAIL, to: 'no-at-sign' } }),
    );
    expect(deliveries.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ toMasked: '***' }),
    );

    primary.channels = [Channel.SMS];
    await service.enqueue(job({ delivery: { channel: Channel.SMS, to: '+15551234567' } }));
    expect(deliveries.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ toMasked: '+1****67' }),
    );

    await service.enqueue(job({ delivery: { channel: Channel.SMS, to: '123' } }));
    expect(deliveries.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ toMasked: '****' }),
    );

    await service.enqueue(job({ delivery: { channel: Channel.IN_APP, to: 'user-42' } }));
    expect(deliveries.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ toMasked: 'user-42' }),
    );
  });

  it('shuts down without a queue', async () => {
    const { service } = makeService();
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });
});

describe('DeliveryQueueService — Redis/BullMQ mode', () => {
  const REDIS_URL = 'rediss://user:pass@redis.example.com:6380/2';

  it('builds queue + worker from the redis url (tls, auth, db)', () => {
    const { service, logger } = makeService({ redisEnabled: true, redisUrl: REDIS_URL });
    service.onModuleInit();
    expect(service.isAsync()).toBe(true);
    expect(mockQueueInstances).toHaveLength(1);
    expect(mockWorkerInstances).toHaveLength(1);
    const connection = mockQueueInstances[0].opts.connection;
    expect(connection).toEqual(
      expect.objectContaining({
        host: 'redis.example.com',
        port: 6380,
        username: 'user',
        password: 'pass',
        db: 2,
        tls: {},
        maxRetriesPerRequest: null,
      }),
    );
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('queue started'), 'Messaging');
  });

  it('defaults port/db for a bare redis url', () => {
    const { service } = makeService({ redisEnabled: true, redisUrl: 'redis://localhost' });
    service.onModuleInit();
    const connection = mockQueueInstances[0].opts.connection;
    expect(connection).toEqual(
      expect.objectContaining({ host: 'localhost', port: 6379, tls: undefined }),
    );
    expect(connection.db).toBeUndefined();
  });

  it('enqueues jobs with retry/backoff options', async () => {
    const { service } = makeService({ redisEnabled: true, redisUrl: REDIS_URL });
    service.onModuleInit();
    await service.enqueue(job());
    expect(mockQueueInstances[0].add).toHaveBeenCalledWith(
      'deliver',
      expect.objectContaining({ messageType: 'WELCOME' }),
      expect.objectContaining({ attempts: 3, backoff: { type: 'exponential', delay: 2000 } }),
    );
  });

  it('the worker processor delegates to processDelivery', async () => {
    const primary = makeProvider('primary', { ok: true });
    const { service, deliveries } = makeService({
      providers: [primary],
      redisEnabled: true,
      redisUrl: REDIS_URL,
    });
    service.onModuleInit();
    await mockWorkerInstances[0].processor({ data: job() });
    expect(primary.send).toHaveBeenCalled();
    expect(deliveries.save).toHaveBeenCalled();
  });

  it('wires error/failed handlers that log instead of crashing', () => {
    const { service, logger } = makeService({ redisEnabled: true, redisUrl: REDIS_URL });
    service.onModuleInit();
    mockQueueInstances[0].handlers.error(new Error('redis blip'));
    mockWorkerInstances[0].handlers.error(new Error('worker blip'));
    mockWorkerInstances[0].handlers.failed({ id: '7' }, new Error('job died'));
    mockWorkerInstances[0].handlers.failed(undefined, new Error('job died early'));
    expect(logger.error).toHaveBeenCalledTimes(4);
  });

  it('closes queue and worker on shutdown, swallowing close failures', async () => {
    const { service } = makeService({ redisEnabled: true, redisUrl: REDIS_URL });
    service.onModuleInit();
    mockWorkerInstances[0].close.mockRejectedValueOnce(new Error('already closed'));
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    expect(mockQueueInstances[0].close).toHaveBeenCalled();
  });

  it('stays inline when RedisService is disabled even if a url is configured', () => {
    const { service } = makeService({ redisEnabled: false, redisUrl: REDIS_URL });
    service.onModuleInit();
    expect(service.isAsync()).toBe(false);
    expect(mockQueueInstances).toHaveLength(0);
  });
});
