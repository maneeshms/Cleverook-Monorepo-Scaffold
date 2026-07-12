import {
  JsonValue,
  Provider,
  ResolutionDetails,
  StandardResolutionReasons,
} from '@openfeature/server-sdk';

/** The normalized shape every provider resolves a key to (or undefined = not set). */
export interface FlagRecord {
  enabled: boolean;
  value: JsonValue | null;
}

/**
 * Shared OpenFeature `Provider` implementation. Subclasses only implement
 * `lookup(flagKey)` — the four typed evaluation methods derive from the single
 * `FlagRecord` so env, database, and any future backing store behave identically.
 *
 * A missing flag returns the caller's default with reason DEFAULT (never throws),
 * so a flag that isn't configured yet degrades safely to its default.
 */
export abstract class BaseFlagProvider implements Provider {
  abstract readonly metadata: { name: string };

  protected abstract lookup(flagKey: string): Promise<FlagRecord | undefined>;

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
  ): Promise<ResolutionDetails<boolean>> {
    const flag = await this.lookup(flagKey);
    if (!flag) return this.miss(defaultValue);
    return { value: flag.enabled, reason: StandardResolutionReasons.STATIC };
  }

  async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
  ): Promise<ResolutionDetails<string>> {
    const flag = await this.lookup(flagKey);
    if (!flag || flag.value == null) return this.miss(defaultValue);
    return { value: String(flag.value), reason: StandardResolutionReasons.STATIC };
  }

  async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
  ): Promise<ResolutionDetails<number>> {
    const flag = await this.lookup(flagKey);
    const num = flag ? Number(flag.value) : NaN;
    if (!flag || flag.value == null || Number.isNaN(num)) return this.miss(defaultValue);
    return { value: num, reason: StandardResolutionReasons.STATIC };
  }

  async resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
  ): Promise<ResolutionDetails<T>> {
    const flag = await this.lookup(flagKey);
    if (!flag || flag.value == null || typeof flag.value !== 'object')
      return this.miss(defaultValue);
    return { value: flag.value as T, reason: StandardResolutionReasons.STATIC };
  }

  private miss<T>(defaultValue: T): ResolutionDetails<T> {
    return { value: defaultValue, reason: StandardResolutionReasons.DEFAULT };
  }
}
