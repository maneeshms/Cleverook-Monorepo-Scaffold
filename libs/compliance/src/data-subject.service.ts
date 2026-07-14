import { Injectable } from '@nestjs/common';
import { PersonalDataRegistry } from './personal-data-registry';
import { ConsentService } from './consent.service';
import { AuditService } from './audit.service';

export interface DataSubjectExport {
  subjectId: string;
  generatedAt: string;
  /** One entry per registered contributor, keyed by its `key` ('profile', ...). */
  data: Record<string, unknown>;
}

export interface ErasureResult {
  subjectId: string;
  erasedAt: string;
  /** Records affected per contributor. */
  affected: Record<string, number>;
  total: number;
}

/**
 * Services the GDPR data-subject rights the scaffold can automate:
 *  - Art. 15 (access) + Art. 20 (portability) → {@link exportData}
 *  - Art. 17 (erasure) → {@link erase}
 *
 * Both iterate the {@link PersonalDataRegistry}, so they stay complete as new
 * modules register — the library never imports feature modules directly. Consent
 * history rides along automatically. Every export and erasure is itself audited.
 */
@Injectable()
export class DataSubjectService {
  constructor(
    private readonly registry: PersonalDataRegistry,
    private readonly consent: ConsentService,
    private readonly audit: AuditService,
  ) {}

  /** Machine-readable copy of everything held about the subject (Art. 15/20). */
  async exportData(subjectId: string): Promise<DataSubjectExport> {
    const data: Record<string, unknown> = {};
    for (const contributor of this.registry.list()) {
      data[contributor.key] = await contributor.collect(subjectId);
    }
    data.consent = await this.consent.history(subjectId);

    await this.audit.record({
      action: 'data.export',
      actorId: subjectId,
      resourceType: 'user',
      resourceId: subjectId,
      metadata: { contributors: Object.keys(data) },
    });

    return { subjectId, generatedAt: new Date().toISOString(), data };
  }

  /**
   * Erase/anonymise the subject across every contributor (Art. 17). Contributors
   * decide delete-vs-anonymise per their referential-integrity needs. The erasure
   * is audited (the audit rows are retained as legally-required proof that the
   * request was honoured — they hold no PII values, only the subject id + counts).
   */
  async erase(subjectId: string): Promise<ErasureResult> {
    const affected: Record<string, number> = {};
    let total = 0;
    for (const contributor of this.registry.list()) {
      const n = await contributor.erase(subjectId);
      affected[contributor.key] = n;
      total += n;
    }

    await this.audit.record({
      action: 'data.erase',
      actorId: subjectId,
      resourceType: 'user',
      resourceId: subjectId,
      metadata: { affected, total },
    });

    return { subjectId, erasedAt: new Date().toISOString(), affected, total };
  }
}
