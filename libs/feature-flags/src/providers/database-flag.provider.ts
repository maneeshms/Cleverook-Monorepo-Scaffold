import { JsonValue } from '@openfeature/server-sdk';
import { Repository } from 'typeorm';
import { FeatureFlag } from '../entities/feature-flag.entity';
import { BaseFlagProvider, FlagRecord } from './base-flag.provider';

/**
 * Reads flags from the `feature_flags` table. Flags are cached in memory for
 * `cacheTtlMs` so a hot path isn't a DB hit per evaluation; the cache refreshes
 * lazily on the next lookup after it goes stale, and `invalidate()` clears it
 * immediately after an admin write.
 */
export class DatabaseFlagProvider extends BaseFlagProvider {
  readonly metadata = { name: 'clevscaffold-database' };

  private cache = new Map<string, FlagRecord>();
  private loadedAt = 0;
  // Coalesces concurrent refreshes: requests that arrive while a refresh is in
  // flight await the same promise instead of each firing its own `repo.find()`,
  // avoiding a DB read spike every time the cache goes stale under load.
  private refreshInFlight: Promise<void> | null = null;

  constructor(
    private readonly repo: Repository<FeatureFlag>,
    private readonly cacheTtlMs = 30_000,
  ) {
    super();
  }

  invalidate(): void {
    this.loadedAt = 0;
  }

  private async refreshIfStale(): Promise<void> {
    if (Date.now() - this.loadedAt < this.cacheTtlMs && this.loadedAt !== 0) return;
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = this.refresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async refresh(): Promise<void> {
    const rows = await this.repo.find();
    this.cache = new Map(
      rows.map((r) => [
        r.key,
        { enabled: r.enabled, value: (r.value ?? null) as JsonValue | null },
      ]),
    );
    this.loadedAt = Date.now();
  }

  protected async lookup(flagKey: string): Promise<FlagRecord | undefined> {
    await this.refreshIfStale();
    return this.cache.get(flagKey);
  }
}
