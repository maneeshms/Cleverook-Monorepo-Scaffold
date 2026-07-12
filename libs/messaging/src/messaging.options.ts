import type { InjectionToken, ModuleMetadata } from '@nestjs/common';

/**
 * Runtime configuration for the messaging library. The host app builds this
 * (typically from its ConfigService) and passes it in via
 * `MessagingModule.forRootAsync(...)`. The library never reads `process.env` or
 * app-specific config namespaces itself — everything comes through here, which
 * is what keeps it portable across apps/projects.
 */
export interface MessagingModuleOptions {
  /** AES-256-GCM key for decrypting provider credentials stored in the DB. */
  encryptionKey: string;
  /** Redis connection URL. When null/undefined, delivery runs inline (no queue). */
  redisUrl?: string | null;
  /** Env/boot fallback for the Resend email provider (DB config takes precedence). */
  resend?: {
    apiKey?: string;
    fromEmail?: string;
    fromName?: string;
  };
  /**
   * Forces the EMAIL channel to a specific provider key (e.g. 'console-email'),
   * overriding the DB route. The "no-surprise" switch between real send and console.
   */
  emailProviderOverride?: string | null;
}

/** DI token for the resolved {@link MessagingModuleOptions}. */
export const MESSAGING_OPTIONS = 'MESSAGING_OPTIONS';

/** Async registration shape for {@link MessagingModule.forRootAsync}. */
export interface MessagingModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  /** Providers to inject into `useFactory` (e.g. ConfigService). */
  inject?: InjectionToken[];
  /** Builds the runtime options — usually from the host's ConfigService. */
  useFactory: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- standard Nest forRootAsync factory signature
    ...args: any[]
  ) => MessagingModuleOptions | Promise<MessagingModuleOptions>;
}
