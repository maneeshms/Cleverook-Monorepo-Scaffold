import type { InjectionToken, ModuleMetadata } from '@nestjs/common';

/**
 * Retention windows in days (GDPR storage-limitation, Art. 5(1)(e)). A value of
 * 0 or below disables purging for that category (keep-forever) — set that only
 * with a documented lawful basis.
 */
export interface RetentionPolicy {
  /** Delete audit rows older than this (audits the deletion first). Default 365. */
  auditLogDays?: number;
  /** Hard-anonymize users soft-deleted longer ago than this. Default 30. */
  softDeletedUserGraceDays?: number;
  /** Delete notification rows older than this. Default 180. */
  notificationDays?: number;
  /** Delete message-delivery audit rows older than this. Default 90. */
  messageDeliveryDays?: number;
}

/**
 * Runtime configuration for the compliance library. The host app builds this
 * from its ConfigService and passes it via `ComplianceModule.forRootAsync(...)`.
 * The library never reads `process.env` itself — everything comes through here,
 * which keeps it portable across apps and projects.
 */
export interface ComplianceModuleOptions {
  /**
   * HMAC key for the audit hash chain. REQUIRED and must be strong — the chain's
   * tamper-evidence depends on this staying secret (environment only). Rotating
   * it starts a new chain from the next row (older rows verify against the old key).
   */
  auditHmacSecret: string;
  /** Retention windows; merged over sensible defaults. */
  retention?: RetentionPolicy;
  /**
   * Run the scheduled retention cron. Default true. Set false to drive retention
   * from an external scheduler (and call `RetentionService.runOnce()` yourself).
   */
  retentionCron?: boolean;
  /**
   * Register the built-in HTTP surface (`/privacy` self-service + `/admin/audit`).
   * Default true. Set false to expose your own routes over the services.
   */
  controller?: boolean;
}

/** DI token for the resolved {@link ComplianceModuleOptions}. */
export const COMPLIANCE_OPTIONS = 'COMPLIANCE_OPTIONS';

/** Async registration shape for {@link ComplianceModule.forRootAsync}. */
export interface ComplianceModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  inject?: InjectionToken[];
  useFactory: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- standard Nest forRootAsync factory signature
    ...args: any[]
  ) => ComplianceModuleOptions | Promise<ComplianceModuleOptions>;
  /** Register the controller. Declared here so async factories can still shape the module. Default true. */
  controller?: boolean;
}

/** Defaults applied when the host omits a retention window. */
export const DEFAULT_RETENTION: Required<RetentionPolicy> = {
  auditLogDays: 365,
  softDeletedUserGraceDays: 30,
  notificationDays: 180,
  messageDeliveryDays: 90,
};
