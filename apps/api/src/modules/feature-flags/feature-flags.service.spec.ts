import { OpenFeature } from '@openfeature/server-sdk';
import { FeatureFlagsService } from './feature-flags.service';
import { DatabaseFlagProvider } from './providers/database-flag.provider';

describe('FeatureFlagsService', () => {
  const logger = { log: jest.fn() };
  const repo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    create: jest.fn(() => ({})),
    merge: jest.fn((a, b) => ({ ...a, ...b })),
    save: jest.fn((x) => Promise.resolve({ id: 'ff1', ...x })),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  // provider key drives selection; cacheTtlMs undefined exercises the `?? 30_000`
  // fallback; FF_* keys resolve from process.env (as ConfigService would).
  const configFor = (provider: string) => ({
    get: (k: string) => {
      if (k === 'featureFlags.provider') return provider;
      if (k === 'featureFlags.cacheTtlMs') return undefined;
      return process.env[k];
    },
  });

  const build = (provider: string) =>
    new FeatureFlagsService(configFor(provider) as never, logger as never, repo as never);

  afterEach(async () => {
    jest.clearAllMocks();
    await OpenFeature.close().catch(() => undefined);
  });

  describe('env provider', () => {
    let service: FeatureFlagsService;
    beforeEach(async () => {
      process.env.FF_UNIT_TEST_FLAG = 'true';
      service = build('env');
      await service.onModuleInit();
    });
    afterEach(() => delete process.env.FF_UNIT_TEST_FLAG);

    it('evaluates a boolean flag from the environment', async () => {
      await expect(service.isEnabled('unit-test-flag')).resolves.toBe(true);
    });

    it('returns the default for an unset flag', async () => {
      await expect(service.isEnabled('nope', false)).resolves.toBe(false);
    });

    it('exposes string/number/object evaluation', async () => {
      process.env.FF_S = 'x';
      process.env.FF_N = '9';
      process.env.FF_O = '{"a":1}';
      await expect(service.getString('s', 'd')).resolves.toBe('x');
      await expect(service.getNumber('n', 0)).resolves.toBe(9);
      await expect(service.getObject('o', {})).resolves.toEqual({ a: 1 });
      delete process.env.FF_S;
      delete process.env.FF_N;
      delete process.env.FF_O;
    });

    it('invalidateCache is a no-op for the env provider', () => {
      expect(() => service.invalidateCache()).not.toThrow();
    });
  });

  describe('database provider', () => {
    let service: FeatureFlagsService;
    beforeEach(async () => {
      service = build('database');
      await service.onModuleInit();
    });

    it('selects the database provider and can invalidate its cache', () => {
      const spy = jest.spyOn(DatabaseFlagProvider.prototype, 'invalidate');
      service.invalidateCache();
      expect(spy).toHaveBeenCalled();
    });

    it('upserts a flag and invalidates the cache', async () => {
      repo.findOne.mockResolvedValue(null);
      const result = await service.upsertFlag({ key: 'k', enabled: true });
      expect(repo.save).toHaveBeenCalled();
      expect(result).toMatchObject({ key: 'k', enabled: true });
    });

    it('updates an existing flag', async () => {
      repo.findOne.mockResolvedValue({ id: 'x', key: 'k', enabled: false });
      await service.upsertFlag({ key: 'k', enabled: true, description: 'd', value: 3 });
      expect(repo.merge).toHaveBeenCalled();
    });

    it('lists and deletes flags', async () => {
      await service.listFlags();
      expect(repo.find).toHaveBeenCalledWith({ order: { key: 'ASC' } });
      await service.deleteFlag('k');
      expect(repo.delete).toHaveBeenCalledWith({ key: 'k' });
    });
  });

  it('closes OpenFeature on destroy', async () => {
    const service = build('env');
    await service.onModuleInit();
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });
});
