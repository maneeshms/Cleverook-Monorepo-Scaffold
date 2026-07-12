/**
 * Parse a human duration string into milliseconds.
 *
 * Supports the same unit suffixes as the JWT config (`s`, `m`, `h`, `d`) plus
 * `w` (weeks) and `ms`, and bare numbers (interpreted as milliseconds — the
 * jsonwebtoken convention). Falls back to `fallbackMs` on anything unparseable
 * so a typo can never produce a zero-length or NaN expiry.
 *
 *   parseDurationMs('30d')  → 2_592_000_000
 *   parseDurationMs('15m')  → 900_000
 *   parseDurationMs('12h')  → 43_200_000   (was silently 12 DAYS before this)
 *   parseDurationMs('bad', 1000) → 1000
 */
const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

export function parseDurationMs(value: string | number | undefined, fallbackMs: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return fallbackMs;

  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10); // bare number = ms

  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)$/i.exec(trimmed);
  if (!match) return fallbackMs;

  const amount = parseFloat(match[1]);
  const unit = UNIT_MS[match[2].toLowerCase()];
  if (!Number.isFinite(amount) || unit === undefined) return fallbackMs;
  return Math.round(amount * unit);
}
