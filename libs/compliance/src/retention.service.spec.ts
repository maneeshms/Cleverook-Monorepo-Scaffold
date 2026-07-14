import { RetentionRegistry, RetentionService } from './retention.service';

describe('RetentionRegistry', () => {
  it('registers and lists targets', () => {
    const r = new RetentionRegistry();
    const t = { key: 'notifications', windowDays: () => 30, purge: jest.fn() };
    r.register(t);
    expect(r.list()).toEqual([t]);
  });
});

describe('RetentionService', () => {
  let auditLogs: { delete: jest.Mock };
  let registry: RetentionRegistry;
  let audit: { record: jest.Mock };
  let logger: { log: jest.Mock; error: jest.Mock };

  const make = (options: any) => {
    auditLogs = { delete: jest.fn().mockResolvedValue({ affected: 5 }) };
    registry = new RetentionRegistry();
    audit = { record: jest.fn() };
    logger = { log: jest.fn(), error: jest.fn() };
    return new RetentionService(
      auditLogs as never,
      options,
      registry,
      audit as never,
      logger as never,
    );
  };

  it('purges audit logs past the window and runs each registered target', async () => {
    const service = make({
      auditHmacSecret: 's',
      retention: { auditLogDays: 100, notificationDays: 30 },
    });
    const purge = jest.fn().mockResolvedValue(7);
    registry.register({ key: 'notifications', windowDays: (p) => p.notificationDays, purge });

    const result = await service.runOnce();
    expect(auditLogs.delete).toHaveBeenCalled();
    expect(purge).toHaveBeenCalledWith(expect.any(Date));
    expect(result).toEqual({ auditLogsPurged: 5, targetsPurged: { notifications: 7 } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'retention.run' }));
  });

  it('skips categories whose window is 0 or less (keep forever)', async () => {
    const service = make({ auditHmacSecret: 's', retention: { auditLogDays: 0 } });
    const purge = jest.fn().mockResolvedValue(0);
    registry.register({ key: 'never', windowDays: () => 0, purge });

    const result = await service.runOnce();
    expect(auditLogs.delete).not.toHaveBeenCalled();
    expect(purge).not.toHaveBeenCalled();
    expect(result.auditLogsPurged).toBe(0);
  });

  it('scheduled() honours the retentionCron:false switch', async () => {
    const service = make({ auditHmacSecret: 's', retentionCron: false });
    const spy = jest.spyOn(service, 'runOnce');
    await service.scheduled();
    expect(spy).not.toHaveBeenCalled();
  });

  it('scheduled() swallows and logs errors from a run', async () => {
    const service = make({ auditHmacSecret: 's' });
    jest.spyOn(service, 'runOnce').mockRejectedValue(new Error('boom'));
    await expect(service.scheduled()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Retention run failed'),
      expect.anything(),
      'Compliance',
    );
  });
});
