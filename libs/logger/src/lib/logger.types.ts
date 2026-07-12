/** Audit action types — security-sensitive operations worth recording. */
export enum AuditAction {
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  LOGOUT_ALL = 'LOGOUT_ALL',
  REGISTER = 'REGISTER',
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  PASSWORD_RESET_REQUEST = 'PASSWORD_RESET_REQUEST',
  PASSWORD_RESET = 'PASSWORD_RESET',
  PERMISSION_CHECK = 'PERMISSION_CHECK',
  ADMIN_ACTION = 'ADMIN_ACTION',
  CUSTOM = 'CUSTOM',
}

export enum AuditStatus {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
}

/** Severity for audit entries. */
export enum SeverityLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/** Severity for alert entries (operational/security alerts). */
export enum AlertSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

export enum AlertCategory {
  SECURITY = 'SECURITY',
  PERFORMANCE = 'PERFORMANCE',
  SYSTEM = 'SYSTEM',
  AUTH = 'AUTH',
  CUSTOM = 'CUSTOM',
}

/** Audit log entry for compliance, investigation, and security monitoring. */
export interface AuditLogEntry {
  timestamp: Date;
  userId?: string;
  username?: string;
  action: AuditAction;
  resource?: string;
  status: AuditStatus;
  statusCode?: number;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
  severity: SeverityLevel;
}

/** Alert log entry for critical security/system events that need attention. */
export interface AlertLogEntry {
  timestamp: Date;
  severity: AlertSeverity;
  category: AlertCategory | string;
  message: string;
  details?: Record<string, unknown>;
  threshold?: number;
  currentValue?: number;
  recipients?: string[];
}

export interface ILogger {
  log(message: string, context?: string): void;
  error(message: string, trace?: string, context?: string): void;
  warn(message: string, context?: string): void;
  debug(message: string, context?: string): void;
  verbose(message: string, context?: string): void;
  audit(entry: AuditLogEntry): void;
  alert(entry: AlertLogEntry): void;
}
