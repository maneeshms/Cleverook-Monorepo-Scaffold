import { canonicalJson, computeChainHash } from './hash-chain';

describe('canonicalJson', () => {
  it('orders keys deterministically regardless of insertion order', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('recurses into nested objects and arrays', () => {
    const out = canonicalJson({ z: [{ y: 1, x: 2 }], a: null });
    expect(out).toBe('{"a":null,"z":[{"x":2,"y":1}]}');
  });
});

describe('computeChainHash', () => {
  it('is deterministic for the same secret/prev/payload', () => {
    const a = computeChainHash('secret', 'prev', { action: 'x' });
    const b = computeChainHash('secret', 'prev', { action: 'x' });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when the secret, prev hash, or payload changes', () => {
    const base = computeChainHash('secret', 'prev', { action: 'x' });
    expect(computeChainHash('other', 'prev', { action: 'x' })).not.toBe(base);
    expect(computeChainHash('secret', 'different', { action: 'x' })).not.toBe(base);
    expect(computeChainHash('secret', 'prev', { action: 'y' })).not.toBe(base);
  });

  it('is insensitive to payload key order (canonicalised first)', () => {
    expect(computeChainHash('s', 'p', { a: 1, b: 2 })).toBe(
      computeChainHash('s', 'p', { b: 2, a: 1 }),
    );
  });
});
