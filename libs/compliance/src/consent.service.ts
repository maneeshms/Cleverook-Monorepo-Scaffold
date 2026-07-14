import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConsentRecord } from './entities/consent-record.entity';
import { AuditService } from './audit.service';

export interface ConsentContext {
  policyVersion?: string | null;
  source?: string | null;
  ipAddress?: string | null;
}

/** Current consent state for one purpose. */
export interface ConsentState {
  purpose: string;
  granted: boolean;
  since: Date;
}

/**
 * Consent ledger service (GDPR Art. 6/7). Grants and withdrawals are appended as
 * immutable rows, so the full history is provable; the current state for a purpose
 * is the newest row. Every change is also written to the audit trail.
 */
@Injectable()
export class ConsentService {
  constructor(
    @InjectRepository(ConsentRecord)
    private readonly repo: Repository<ConsentRecord>,
    private readonly audit: AuditService,
  ) {}

  private async write(
    userId: string,
    purpose: string,
    granted: boolean,
    ctx: ConsentContext,
  ): Promise<ConsentRecord> {
    const row = await this.repo.save(
      this.repo.create({
        userId,
        purpose,
        granted,
        policyVersion: ctx.policyVersion ?? null,
        source: ctx.source ?? null,
        ipAddress: ctx.ipAddress ?? null,
      }),
    );
    await this.audit.record({
      action: granted ? 'consent.grant' : 'consent.withdraw',
      actorId: userId,
      resourceType: 'consent',
      resourceId: purpose,
      ipAddress: ctx.ipAddress ?? null,
      metadata: { policyVersion: ctx.policyVersion ?? null, source: ctx.source ?? null },
    });
    return row;
  }

  grant(userId: string, purpose: string, ctx: ConsentContext = {}): Promise<ConsentRecord> {
    return this.write(userId, purpose, true, ctx);
  }

  withdraw(userId: string, purpose: string, ctx: ConsentContext = {}): Promise<ConsentRecord> {
    return this.write(userId, purpose, false, ctx);
  }

  /** Current state per purpose for a subject (newest row wins). */
  async current(userId: string): Promise<ConsentState[]> {
    const rows = await this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    const seen = new Map<string, ConsentState>();
    for (const row of rows) {
      if (!seen.has(row.purpose)) {
        seen.set(row.purpose, { purpose: row.purpose, granted: row.granted, since: row.createdAt });
      }
    }
    return [...seen.values()];
  }

  /** Whether a purpose is currently granted (default false = no consent on record). */
  async isGranted(userId: string, purpose: string): Promise<boolean> {
    const latest = await this.repo.findOne({
      where: { userId, purpose },
      order: { createdAt: 'DESC' },
    });
    return latest?.granted ?? false;
  }

  /** All raw consent rows for a subject — feeds the GDPR export. */
  history(userId: string): Promise<ConsentRecord[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: 'ASC' } });
  }
}
