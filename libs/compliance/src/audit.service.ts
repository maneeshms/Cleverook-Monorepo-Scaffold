import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoggerService } from '@clevrook/logger';
import { AuditLog } from './entities/audit-log.entity';
import { COMPLIANCE_OPTIONS, ComplianceModuleOptions } from './compliance.options';
import { computeChainHash } from './hash-chain';

/** The recordable fields of an audit event (chain/sequence fields are derived). */
export interface AuditEvent {
  action: string;
  actorId?: string | null;
  actorType?: 'user' | 'system' | 'service';
  resourceType?: string | null;
  resourceId?: string | null;
  outcome?: 'success' | 'failure' | 'denied';
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Result of a chain integrity check. `brokenAtSequence` is the first bad row. */
export interface ChainVerification {
  ok: boolean;
  checked: number;
  brokenAtSequence?: string;
}

// Constant key for the Postgres transaction-level advisory lock that serialises
// audit appends (so concurrent writers can't fork the hash chain).
const AUDIT_LOCK_KEY = 4815162342;

/**
 * Writes the append-only, hash-chained audit trail (SOC 2 CC7). Every event is
 * chained to the previous row under an HMAC key held only in the environment, so
 * the log is tamper-evident: `verifyChain()` recomputes the chain and reports the
 * first row that doesn't match.
 *
 * Appends are serialised with a Postgres advisory lock inside a transaction, so
 * concurrent requests can't read the same tip and fork the chain. Writes also
 * mirror to the Winston audit stream for real-time SIEM shipping.
 */
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
    @Inject(COMPLIANCE_OPTIONS)
    private readonly options: ComplianceModuleOptions,
    private readonly logger: LoggerService,
  ) {}

  /** Append one immutable, chained audit row. Never throws to the caller path. */
  async record(event: AuditEvent): Promise<void> {
    try {
      await this.repo.manager.transaction(async (em) => {
        // Serialise appends across connections/instances so the chain never forks.
        await em.query('SELECT pg_advisory_xact_lock($1)', [AUDIT_LOCK_KEY]);

        const tip = await em
          .getRepository(AuditLog)
          .createQueryBuilder('a')
          .orderBy('a.sequence', 'DESC')
          .limit(1)
          .getOne();
        const prevHash = tip?.hash ?? '';

        const row = em.getRepository(AuditLog).create({
          action: event.action,
          actorId: event.actorId ?? null,
          actorType: event.actorType ?? 'user',
          resourceType: event.resourceType ?? null,
          resourceId: event.resourceId ?? null,
          outcome: event.outcome ?? 'success',
          ipAddress: event.ipAddress ?? null,
          userAgent: event.userAgent ?? null,
          requestId: event.requestId ?? null,
          metadata: event.metadata ?? null,
          prevHash,
        });
        row.hash = computeChainHash(this.options.auditHmacSecret, prevHash, this.payload(row));
        await em.getRepository(AuditLog).save(row);
      });
    } catch (err) {
      // An audit write must never break the business operation, but a failure to
      // record is itself security-relevant — surface it loudly.
      this.logger.error(
        `Audit write failed for '${event.action}': ${(err as Error).message}`,
        (err as Error).stack,
        'Compliance',
      );
    }

    // Mirror to the Winston audit stream regardless (real-time visibility / SIEM).
    this.logger.log(`[audit] ${event.action} ${event.outcome ?? 'success'}`, 'Compliance');
  }

  /**
   * Recompute the whole chain and report the first row whose stored hash doesn't
   * match — evidence of insertion, edit, deletion, or reordering. O(n); run it as
   * a scheduled integrity check or on demand for an audit.
   */
  async verifyChain(): Promise<ChainVerification> {
    const rows = await this.repo.createQueryBuilder('a').orderBy('a.sequence', 'ASC').getMany();
    let prevHash = '';
    for (const row of rows) {
      const expected = computeChainHash(this.options.auditHmacSecret, prevHash, this.payload(row));
      if (row.prevHash !== prevHash || row.hash !== expected) {
        return { ok: false, checked: rows.length, brokenAtSequence: row.sequence };
      }
      prevHash = row.hash;
    }
    return { ok: true, checked: rows.length };
  }

  /**
   * The exact fields covered by the hash. Excludes `sequence` (DB-generated on
   * insert, so unknown at hash time) and the chain fields themselves — ordering
   * integrity comes from the `prevHash` linkage, not from `sequence`.
   */
  private payload(row: AuditLog): Record<string, unknown> {
    return {
      action: row.action,
      actorId: row.actorId,
      actorType: row.actorType,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      outcome: row.outcome,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      requestId: row.requestId,
      metadata: row.metadata,
    };
  }
}
