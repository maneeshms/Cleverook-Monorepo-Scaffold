import type { InjectionToken, ModuleMetadata } from '@nestjs/common';

/** Reads a config/env value by key. Backed by the host's ConfigService (never raw process.env). */
export type EnvGetter = (key: string) => string | undefined;

/**
 * Runtime configuration for the feature-flags library. The host app builds this
 * (typically from its ConfigService) and passes it in via
 * `FeatureFlagsModule.forRootAsync(...)`. The library never reads `process.env`
 * or app-specific config namespaces itself — everything comes through here, which
 * is what keeps it portable across apps and projects.
 */
export interface FeatureFlagsModuleOptions {
  /**
   * Which OpenFeature provider backs evaluation: `env` reads `FF_<KEY>` values via
   * {@link envGetter}; `database` reads the `feature_flags` table. Defaults to `env`.
   * Swap for a hosted provider (LaunchDarkly, Flagsmith, ...) later without
   * touching call sites.
   */
  provider?: string;
  /** How long the `database` provider caches flags in memory. Defaults to 30_000ms. */
  cacheTtlMs?: number;
  /**
   * Reads `FF_<KEY>` values for the `env` provider — usually
   * `(key) => configService.get(key)`. Required for the `env` provider; without it
   * every env flag resolves to its default.
   */
  envGetter?: EnvGetter;
  /**
   * Register the built-in admin CRUD controller (`/feature-flags`). Defaults to
   * true. Set false to expose your own HTTP surface while still using the service.
   */
  controller?: boolean;
}

/** DI token for the resolved {@link FeatureFlagsModuleOptions}. */
export const FEATURE_FLAGS_OPTIONS = 'FEATURE_FLAGS_OPTIONS';

/** Async registration shape for {@link FeatureFlagsModule.forRootAsync}. */
export interface FeatureFlagsModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  /** Providers to inject into `useFactory` (e.g. ConfigService). */
  inject?: InjectionToken[];
  /** Builds the runtime options — usually from the host's ConfigService. */
  useFactory: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- standard Nest forRootAsync factory signature
    ...args: any[]
  ) => FeatureFlagsModuleOptions | Promise<FeatureFlagsModuleOptions>;
  /**
   * Register the admin controller. When the factory is async this can't be read
   * from the resolved options in time to shape the module, so it's declared here.
   * Defaults to true.
   */
  controller?: boolean;
}
