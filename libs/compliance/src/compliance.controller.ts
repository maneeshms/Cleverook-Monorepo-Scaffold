import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthenticatedUser, CurrentUser, Role, Roles } from '@clevrook/common';
import { DataSubjectService } from './data-subject.service';
import { ConsentService } from './consent.service';
import { AuditService } from './audit.service';
import { UpdateConsentDto } from './dto/consent.dto';

/**
 * Built-in compliance HTTP surface. Two audiences:
 *  - `/privacy/*` — self-service data-subject rights for the authenticated user
 *    (GDPR Art. 15 export, Art. 17 erasure, Art. 7 consent).
 *  - `/admin/audit/*` — ADMIN-only audit-trail read + integrity verification
 *    (SOC 2 CC7 / ISO 27001 A.8.15 evidence).
 *
 * Assumes the host wires the standard guard chain (JWT + Roles) globally — the
 * same assumption every scaffold app makes. Opt out with `controller: false` and
 * expose the services yourself.
 */
@ApiTags('compliance')
@ApiBearerAuth()
@Controller()
export class ComplianceController {
  constructor(
    private readonly dataSubject: DataSubjectService,
    private readonly consent: ConsentService,
    private readonly audit: AuditService,
  ) {}

  private ip(req: Request): string | null {
    return (
      (req.headers['cf-connecting-ip'] as string) ??
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.ip ??
      null
    );
  }

  @Get('privacy/export')
  @ApiOperation({ summary: 'Export all my personal data (GDPR Art. 15/20)' })
  exportMine(@CurrentUser() user: AuthenticatedUser) {
    return this.dataSubject.exportData(user.sub);
  }

  @Post('privacy/erase')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Erase/anonymise my personal data (GDPR Art. 17)' })
  eraseMine(@CurrentUser() user: AuthenticatedUser) {
    return this.dataSubject.erase(user.sub);
  }

  @Get('privacy/consent')
  @ApiOperation({ summary: 'My current consent state per purpose' })
  myConsent(@CurrentUser() user: AuthenticatedUser) {
    return this.consent.current(user.sub);
  }

  @Post('privacy/consent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Grant or withdraw consent for a purpose (GDPR Art. 7)' })
  updateConsent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateConsentDto,
    @Req() req: Request,
  ) {
    const ctx = {
      policyVersion: dto.policyVersion ?? null,
      source: 'api',
      ipAddress: this.ip(req),
    };
    return dto.granted
      ? this.consent.grant(user.sub, dto.purpose, ctx)
      : this.consent.withdraw(user.sub, dto.purpose, ctx);
  }

  @Get('admin/audit/verify')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Verify audit-trail integrity (tamper-evidence check)' })
  verify() {
    return this.audit.verifyChain();
  }
}
