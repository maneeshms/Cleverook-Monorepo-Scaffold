import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { LoggerService } from '@clevrook/logger';
import { AuditLog } from './entities/audit-log.entity';
import { AuditService } from './audit.service';
import {
  COMPLIANCE_OPTIONS,
  ComplianceModuleOptions,
  DEFAULT_RETENTION,
  RetentionPolicy,
} from './compliance.options';

export interface RetentionRunResult {
  auditLogsPurged: number;
  targetsPurged: Record<string, number>;
}

/**
 * A category whose aged rows the retention job can purge. Feature modules (or the
 * host) register these so retention stays complete without the library importing
 * their entities — same inversion of control as PersonalDataRegistry.
 */
export interface RetentionTarget {
  /** Key naming the target, e.g. 'notifications', 'message_deliveries'. */
  key: string;
  /** Which retention window (in days) applies. Return 0 or less to skip. */
  windowDays: (policy: Required<RetentionPolicy>) => number;
  /** Delete/anonymise rows older than `olderThan`; return the count affected. */
  purge(olderThan: Date): Promise<number>;
}

/**
 * Runtime registry of {@link RetentionTarget}s. Feature modules call `register(...)`
 * in their `onModuleInit`; the RetentionService iterates it each run. Mirrors
 * PersonalDataRegistry so retention becomes complete as modules opt in.
 */
@Injectable()
export class RetentionRegistry {
  private readonly targets = new Map<string, RetentionTarget>();

  register(target: RetentionTarget): void {
    this.targets.set(target.key, target);
  }

  list(): RetentionTarget[] {
    return [...this.targets.values()];
  }
}

/**
 * Enforces storage limitation (GDPR Art. 5(1)(e); ISO 27001 A.8.10; SOC 2). Runs
 * daily, deleting data past its retention window. Audit rows are the one category
 * purged here directly (retention of the trail itself); everything else is driven
 * by registered {@link RetentionTarget}s. A window of 0 or less means "keep
 * forever" (skip).
 */
@Injectable()
export class RetentionService {
  private readonly policy: Required<RetentionPolicy>;

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogs: Repository<AuditLog>,
    @Inject(COMPLIANCE_OPTIONS)
    private readonly options: ComplianceModuleOptions,
    private readonly registry: RetentionRegistry,
    private readonly audit: AuditService,
    private readonly logger: LoggerService,
  ) {
    this.policy = { ...DEFAULT_RETENTION, ...(this.options.retention ?? {}) };
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'compliance-retention' })
  async scheduled(): Promise<void> {
    if (this.options.retentionCron === false) return;
    try {
      await this.runOnce();
    } catch (err) {
      this.logger.error(
        `Retention run failed: ${(err as Error).message}`,
        (err as Error).stack,
        'Compliance',
      );
    }
  }

  /** Run every retention window once. Safe to call manually / from a scheduler. */
  async runOnce(): Promise<RetentionRunResult> {
    const now = Date.now();
    const cutoff = (days: number) => new Date(now - days * 86_400_000);

    let auditLogsPurged = 0;
    if (this.policy.auditLogDays > 0) {
      const res = await this.auditLogs.delete({
        recordedAt: LessThan(cutoff(this.policy.auditLogDays)),
      });
      auditLogsPurged = res.affected ?? 0;
    }

    const targetsPurged: Record<string, number> = {};
    for (const target of this.registry.list()) {
      const days = target.windowDays(this.policy);
      if (days <= 0) continue;
      targetsPurged[target.key] = await target.purge(cutoff(days));
    }

    await this.audit.record({
      action: 'retention.run',
      actorType: 'system',
      actorId: null,
      metadata: { auditLogsPurged, targetsPurged },
    });
    this.logger.log(
      `Retention run: ${auditLogsPurged} audit rows purged; ${JSON.stringify(targetsPurged)}`,
      'Compliance',
    );

    return { auditLogsPurged, targetsPurged };
  }
}
