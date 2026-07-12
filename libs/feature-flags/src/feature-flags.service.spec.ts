import { OpenFeature } from '@openfeature/server-sdk';
import { FeatureFlagsService } from './feature-flags.service';
import type { FeatureFlagsModuleOptions } from './feature-flags.options';
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
  // envGetter reads FF_* from process.env exactly as the host's ConfigService
  // would; cacheTtlMs omitted exercises the `?? 30_000` fallback in the service.
  const build = (options: FeatureFlagsModuleOptions) =>
    new FeatureFlagsService(options, logger as never, repo as never);

  afterEach(async () => {
    jest.clearAllMocks();
    await OpenFeature.close().catch(() => undefined);
  });

  describe('env provider', () => {
    let service: FeatureFlagsService;
    beforeEach(async () => {
      process.env.FF_UNIT_TEST_FLAG = 'true';
      // provider omitted → defaults to 'env' (covers the `?? 'env'` branch).
      service = build({ envGetter: (k) => process.env[k] });
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

  it('falls back to a no-op getter when none is supplied (env flags resolve to default)', async () => {
    const service = build({ provider: 'env' });
    await service.onModuleInit();
    await expect(service.isEnabled('anything', true)).resolves.toBe(true);
  });

  describe('database provider', () => {
    let service: FeatureFlagsService;
    beforeEach(async () => {
      // Mixed-case provider name exercises the toLowerCase() normalization.
      service = build({ provider: 'Database' });
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
    const service = build({ envGetter: () => undefined });
    await service.onModuleInit();
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });
});
