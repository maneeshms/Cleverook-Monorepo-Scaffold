import { parseDurationMs } from './duration';

describe('parseDurationMs', () => {
  const FALLBACK = 999;

  it.each([
    ['30d', 30 * 86_400_000],
    ['15m', 15 * 60_000],
    ['12h', 12 * 3_600_000],
    ['45s', 45_000],
    ['2w', 2 * 604_800_000],
    ['500ms', 500],
  ])('parses %s', (input, expected) => {
    expect(parseDurationMs(input, FALLBACK)).toBe(expected);
  });

  it('does not confuse hours with days (regression)', () => {
    expect(parseDurationMs('12h', FALLBACK)).toBe(43_200_000);
    expect(parseDurationMs('12h', FALLBACK)).not.toBe(12 * 86_400_000);
  });

  it('treats a bare number as milliseconds', () => {
    expect(parseDurationMs('1000', FALLBACK)).toBe(1000);
  });

  it('passes through a finite number unchanged', () => {
    expect(parseDurationMs(2500, FALLBACK)).toBe(2500);
  });

  it('accepts uppercase units and surrounding space', () => {
    expect(parseDurationMs(' 1H ', FALLBACK)).toBe(3_600_000);
  });

  it('handles fractional amounts', () => {
    expect(parseDurationMs('1.5h', FALLBACK)).toBe(5_400_000);
  });

  it.each([undefined, '', 'abc', '10x', 'NaN', '10 10d'])(
    'falls back on unparseable input %s',
    (input) => {
      expect(parseDurationMs(input as string | undefined, FALLBACK)).toBe(FALLBACK);
    },
  );

  it('falls back on a non-finite number', () => {
    expect(parseDurationMs(Number.NaN, FALLBACK)).toBe(FALLBACK);
  });
});
