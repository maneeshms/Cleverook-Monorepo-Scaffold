import { DatabaseFlagProvider } from './database-flag.provider';

describe('DatabaseFlagProvider', () => {
  const rows = [
    { key: 'a', enabled: true, value: null },
    { key: 'b', enabled: false, value: 'variant' },
    { key: 'n', enabled: true, value: 5 },
    { key: 'o', enabled: true, value: { rollout: 10 } },
  ];
  const repo = { find: jest.fn() };
  let provider: DatabaseFlagProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    repo.find.mockResolvedValue(rows);
    provider = new DatabaseFlagProvider(repo as never, 1000);
  });

  it('resolves a boolean flag from the table', async () => {
    await expect(provider.resolveBooleanEvaluation('a', false)).resolves.toMatchObject({
      value: true,
      reason: 'STATIC',
    });
  });

  it('returns default with DEFAULT reason for an unknown key', async () => {
    await expect(provider.resolveBooleanEvaluation('zzz', true)).resolves.toEqual({
      value: true,
      reason: 'DEFAULT',
    });
  });

  it('resolves a string variant', async () => {
    await expect(provider.resolveStringEvaluation('b', 'x')).resolves.toMatchObject({
      value: 'variant',
    });
  });

  it('resolves number and object variants', async () => {
    await expect(provider.resolveNumberEvaluation('n', 0)).resolves.toMatchObject({ value: 5 });
    await expect(provider.resolveObjectEvaluation('o', {})).resolves.toMatchObject({
      value: { rollout: 10 },
    });
  });

  it('falls back to default when the stored value is null (non-boolean evals)', async () => {
    await expect(provider.resolveStringEvaluation('a', 'd')).resolves.toEqual({
      value: 'd',
      reason: 'DEFAULT',
    });
    await expect(provider.resolveNumberEvaluation('a', 1)).resolves.toEqual({
      value: 1,
      reason: 'DEFAULT',
    });
    await expect(provider.resolveObjectEvaluation('a', { z: 1 })).resolves.toEqual({
      value: { z: 1 },
      reason: 'DEFAULT',
    });
  });

  it('falls back when a number eval hits a non-numeric value', async () => {
    await expect(provider.resolveNumberEvaluation('b', 7)).resolves.toEqual({
      value: 7,
      reason: 'DEFAULT',
    });
  });

  it('falls back when an object eval hits a scalar value', async () => {
    await expect(provider.resolveObjectEvaluation('b', { a: 1 })).resolves.toEqual({
      value: { a: 1 },
      reason: 'DEFAULT',
    });
  });

  it('caches within the TTL (single DB read for repeated lookups)', async () => {
    await provider.resolveBooleanEvaluation('a', false);
    await provider.resolveBooleanEvaluation('a', false);
    await provider.resolveStringEvaluation('b', 'x');
    expect(repo.find).toHaveBeenCalledTimes(1);
  });

  it('re-reads after invalidate()', async () => {
    await provider.resolveBooleanEvaluation('a', false);
    provider.invalidate();
    await provider.resolveBooleanEvaluation('a', false);
    expect(repo.find).toHaveBeenCalledTimes(2);
  });

  it('re-reads after the TTL elapses', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000);
    await provider.resolveBooleanEvaluation('a', false);
    nowSpy.mockReturnValue(1_000 + 2_000); // past the 1000ms TTL
    await provider.resolveBooleanEvaluation('a', false);
    expect(repo.find).toHaveBeenCalledTimes(2);
    nowSpy.mockRestore();
  });

  it('exposes provider metadata', () => {
    expect(provider.metadata.name).toBe('clevscaffold-database');
  });
});
