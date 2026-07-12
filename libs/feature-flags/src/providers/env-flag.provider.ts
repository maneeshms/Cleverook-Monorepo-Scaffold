import { JsonValue } from '@openfeature/server-sdk';
import type { EnvGetter } from '../feature-flags.options';
import { BaseFlagProvider, FlagRecord } from './base-flag.provider';

/**
 * Reads flags from environment variables: flag key `new-checkout` maps to
 * `FF_NEW_CHECKOUT`. `true/1/on/yes` → enabled; the raw string (JSON-parsed when
 * possible) is the variant value for string/number/object evaluations.
 *
 * Values are read through the injected getter (the host's ConfigService), so they
 * still flow through the layered config loader — no direct process.env access.
 */
export class EnvFlagProvider extends BaseFlagProvider {
  readonly metadata = { name: 'clevscaffold-env' };

  constructor(private readonly get: EnvGetter) {
    super();
  }

  static envKey(flagKey: string): string {
    return 'FF_' + flagKey.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  }

  protected async lookup(flagKey: string): Promise<FlagRecord | undefined> {
    const raw = this.get(EnvFlagProvider.envKey(flagKey));
    if (raw === undefined || raw === null) return undefined;

    const enabled = /^(true|1|on|yes)$/i.test(raw.trim());
    return { enabled, value: this.parse(raw) };
  }

  private parse(raw: string): JsonValue {
    try {
      return JSON.parse(raw) as JsonValue;
    } catch {
      return raw; // plain string variant
    }
  }
}
