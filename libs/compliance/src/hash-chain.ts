import { createHmac } from 'crypto';

/**
 * Deterministic JSON: stable key ordering at every level so the same logical
 * payload always serializes to the same string (a prerequisite for a verifiable
 * hash chain — key-order drift would break verification of untampered rows).
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeys((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

/**
 * Chain link: `HMAC-SHA256(secret, prevHash | canonical(payload))`, hex.
 * Keyed (HMAC, not plain SHA-256) so an actor who can write the table still
 * can't forge a valid continuation without the environment-only secret.
 */
export function computeChainHash(secret: string, prevHash: string, payload: unknown): string {
  return createHmac('sha256', secret)
    .update(`${prevHash}|${canonicalJson(payload)}`)
    .digest('hex');
}
