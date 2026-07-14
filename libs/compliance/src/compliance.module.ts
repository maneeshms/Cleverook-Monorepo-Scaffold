import { DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { ConsentRecord } from './entities/consent-record.entity';
import { COMPLIANCE_OPTIONS, ComplianceModuleAsyncOptions } from './compliance.options';
import { AuditService } from './audit.service';
import { ConsentService } from './consent.service';
import { DataSubjectService } from './data-subject.service';
import { PersonalDataRegistry } from './personal-data-registry';
import { RetentionRegistry, RetentionService } from './retention.service';
import { ComplianceController } from './compliance.controller';

/**
 * Compliance toolkit as a reusable, config-injected NestJS library — the technical
 * substrate for SOC 2, GDPR, and ISO 27001 evidence:
 *   - {@link AuditService} — append-only, HMAC-chained, tamper-evident audit trail
 *   - {@link DataSubjectService} — GDPR export (Art. 15/20) + erasure (Art. 17)
 *   - {@link ConsentService} — consent ledger (Art. 6/7)
 *   - {@link RetentionService} — scheduled storage-limitation enforcement
 *
 * Registered via `ComplianceModule.forRootAsync({...})`; the library reads no
 * env/app-config itself. Feature modules contribute their personal data through
 * the {@link PersonalDataRegistry} and retention windows through
 * {@link RETENTION_TARGETS}, so export/erasure/retention stay complete without the
 * library importing them.
 */
@Module({})
export class ComplianceModule {
  static forRootAsync(options: ComplianceModuleAsyncOptions): DynamicModule {
    return {
      module: ComplianceModule,
      global: true,
      imports: [...(options.imports ?? []), TypeOrmModule.forFeature([AuditLog, ConsentRecord])],
      controllers: options.controller === false ? [] : [ComplianceController],
      providers: [
        {
          provide: COMPLIANCE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        PersonalDataRegistry,
        RetentionRegistry,
        AuditService,
        ConsentService,
        DataSubjectService,
        RetentionService,
      ],
      exports: [
        AuditService,
        ConsentService,
        DataSubjectService,
        RetentionService,
        PersonalDataRegistry,
        RetentionRegistry,
      ],
    };
  }
}
