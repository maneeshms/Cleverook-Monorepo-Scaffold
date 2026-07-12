import { Injectable, Inject, LoggerService as NestLoggerService } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger as WinstonLogger } from 'winston';
import {
  AlertCategory,
  AlertLogEntry,
  AlertSeverity,
  AuditAction,
  AuditLogEntry,
  AuditStatus,
  ILogger,
  SeverityLevel,
} from './logger.types';

/**
 * Centralized application logger (Winston-backed) implementing the NestJS
 * LoggerService contract plus structured **audit** and **alert** streams.
 *
 * - audit(): security-sensitive events (login, logout, admin actions) →
 *   tagged `category: 'audit'` and routed to logs/audit.log.
 * - alert(): operational/security alerts needing attention → tagged
 *   `category: 'alert'` and routed to logs/alert.log; CRITICAL escalates to error.
 *
 * Never pass secrets/tokens/passwords into any method.
 */
@Injectable()
export class LoggerService implements NestLoggerService, ILogger {
  constructor(@Inject(WINSTON_MODULE_PROVIDER) private readonly logger: WinstonLogger) {}

  log(message: string, context?: string): void {
    this.logger.info(message, { context });
  }

  error(message: string, trace?: string, context?: string): void {
    this.logger.error(message, { trace, context });
  }

  warn(message: string, context?: string): void {
    this.logger.warn(message, { context });
  }

  debug(message: string, context?: string): void {
    this.logger.debug(message, { context });
  }

  verbose(message: string, context?: string): void {
    this.logger.verbose(message, { context });
  }

  /** Record a security-sensitive audit event (compliance / investigation). */
  audit(entry: AuditLogEntry): void {
    const level = entry.status === AuditStatus.FAILURE ? 'warn' : 'info';
    this.logger[level](`AUDIT: ${entry.action}`, {
      ...entry,
      context: 'AuditLog',
      category: 'audit',
    });
  }

  /** Raise a security/system alert that requires attention. */
  alert(entry: AlertLogEntry): void {
    const level = entry.severity === AlertSeverity.CRITICAL ? 'error' : 'warn';
    this.logger[level](`ALERT [${entry.category}]: ${entry.message}`, {
      ...entry,
      context: 'AlertLog',
      category: 'alert',
    });
  }

  /** Convenience: auth-related audit entry. */
  auditAuth(
    action: AuditAction,
    status: AuditStatus,
    userId?: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.audit({
      timestamp: new Date(),
      action,
      status,
      userId,
      severity: status === AuditStatus.FAILURE ? SeverityLevel.HIGH : SeverityLevel.LOW,
      metadata,
    });
  }

  /** Convenience: security alert. */
  alertSecurity(
    message: string,
    severity: AlertSeverity = AlertSeverity.WARNING,
    details?: Record<string, unknown>,
  ): void {
    this.alert({
      timestamp: new Date(),
      severity,
      category: AlertCategory.SECURITY,
      message,
      details,
    });
  }
}
