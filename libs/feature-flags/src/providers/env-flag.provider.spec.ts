import { EnvFlagProvider } from './env-flag.provider';

describe('EnvFlagProvider', () => {
  const make = (env: Record<string, string>) => new EnvFlagProvider((k) => env[k]);

  it('maps a flag key to FF_<UPPER_SNAKE>', () => {
    expect(EnvFlagProvider.envKey('new-checkout.v2')).toBe('FF_NEW_CHECKOUT_V2');
  });

  it('resolves an enabled boolean from truthy strings', async () => {
    for (const raw of ['true', '1', 'on', 'YES']) {
      const p = make({ FF_X: raw });
      await expect(p.resolveBooleanEvaluation('x', false)).resolves.toMatchObject({ value: true });
    }
  });

  it('resolves false for a non-truthy value', async () => {
    const p = make({ FF_X: 'nope' });
    await expect(p.resolveBooleanEvaluation('x', true)).resolves.toMatchObject({ value: false });
  });

  it('returns the default with reason DEFAULT when unset', async () => {
    const p = make({});
    await expect(p.resolveBooleanEvaluation('missing', true)).resolves.toEqual({
      value: true,
      reason: 'DEFAULT',
    });
  });

  it('resolves a plain string variant', async () => {
    const p = make({ FF_THEME: 'dark' });
    await expect(p.resolveStringEvaluation('theme', 'light')).resolves.toMatchObject({
      value: 'dark',
    });
  });

  it('resolves a numeric variant', async () => {
    const p = make({ FF_LIMIT: '42' });
    await expect(p.resolveNumberEvaluation('limit', 1)).resolves.toMatchObject({ value: 42 });
  });

  it('falls back for a non-numeric value on number evaluation', async () => {
    const p = make({ FF_LIMIT: 'lots' });
    await expect(p.resolveNumberEvaluation('limit', 7)).resolves.toEqual({
      value: 7,
      reason: 'DEFAULT',
    });
  });

  it('parses and resolves a JSON object variant', async () => {
    const p = make({ FF_CFG: '{"rollout":25}' });
    await expect(p.resolveObjectEvaluation('cfg', {})).resolves.toMatchObject({
      value: { rollout: 25 },
    });
  });

  it('falls back to default when object evaluation gets a scalar', async () => {
    const p = make({ FF_CFG: 'scalar' });
    await expect(p.resolveObjectEvaluation('cfg', { a: 1 })).resolves.toEqual({
      value: { a: 1 },
      reason: 'DEFAULT',
    });
  });

  it('exposes provider metadata', () => {
    expect(make({}).metadata.name).toBe('clevscaffold-env');
  });
});
