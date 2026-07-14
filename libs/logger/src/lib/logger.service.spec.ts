import { LoggerService } from './logger.service';
import { AuditAction, AuditStatus, AlertSeverity } from './logger.types';

describe('LoggerService', () => {
  let service: LoggerService;
  let winston: {
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
    verbose: jest.Mock;
  };

  beforeEach(() => {
    winston = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    };
    service = new LoggerService(winston as never);
  });

  it('delegates standard levels to winston', () => {
    service.log('hello', 'Ctx');
    expect(winston.info).toHaveBeenCalledWith('hello', { context: 'Ctx' });
    service.error('boom', 'trace', 'Ctx');
    expect(winston.error).toHaveBeenCalledWith('boom', { trace: 'trace', context: 'Ctx' });
    service.warn('careful', 'Ctx');
    expect(winston.warn).toHaveBeenCalledWith('careful', { context: 'Ctx' });
    service.debug('detail', 'Ctx');
    expect(winston.debug).toHaveBeenCalledWith('detail', { context: 'Ctx' });
    service.verbose('chatty', 'Ctx');
    expect(winston.verbose).toHaveBeenCalledWith('chatty', { context: 'Ctx' });
  });

  it('writes a success audit at info with category=audit', () => {
    service.auditAuth(AuditAction.LOGIN, AuditStatus.SUCCESS, 'u1');
    expect(winston.info).toHaveBeenCalledWith(
      'AUDIT: LOGIN',
      expect.objectContaining({
        category: 'audit',
        context: 'AuditLog',
        status: AuditStatus.SUCCESS,
      }),
    );
  });

  it('writes a failure audit at warn', () => {
    service.auditAuth(AuditAction.LOGIN, AuditStatus.FAILURE, 'u1', { reason: 'bad_password' });
    expect(winston.warn).toHaveBeenCalledWith(
      'AUDIT: LOGIN',
      expect.objectContaining({ category: 'audit' }),
    );
  });

  it('escalates a CRITICAL alert to error with category=alert', () => {
    service.alert({
      timestamp: new Date(),
      severity: AlertSeverity.CRITICAL,
      category: 'SECURITY',
      message: 'token reuse',
    });
    expect(winston.error).toHaveBeenCalledWith(
      'ALERT [SECURITY]: token reuse',
      expect.objectContaining({ category: 'alert' }),
    );
  });

  it('logs a WARNING security alert at warn', () => {
    service.alertSecurity('suspicious', AlertSeverity.WARNING, { ip: '1.2.3.4' });
    expect(winston.warn).toHaveBeenCalledWith(
      'ALERT [SECURITY]: suspicious',
      expect.objectContaining({ category: 'alert' }),
    );
  });

  it('defaults alertSecurity to WARNING severity', () => {
    service.alertSecurity('odd traffic');
    expect(winston.warn).toHaveBeenCalledWith(
      'ALERT [SECURITY]: odd traffic',
      expect.objectContaining({ severity: AlertSeverity.WARNING }),
    );
  });
});
