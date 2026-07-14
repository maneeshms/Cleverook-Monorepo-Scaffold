import { ComplianceController } from './compliance.controller';

describe('ComplianceController', () => {
  let dataSubject: { exportData: jest.Mock; erase: jest.Mock };
  let consent: { current: jest.Mock; grant: jest.Mock; withdraw: jest.Mock };
  let audit: { verifyChain: jest.Mock };
  let controller: ComplianceController;
  const user = { sub: 'u1' } as any;
  const req = { headers: {}, ip: '9.9.9.9' } as any;

  beforeEach(() => {
    dataSubject = {
      exportData: jest.fn().mockResolvedValue('export'),
      erase: jest.fn().mockResolvedValue('erased'),
    };
    consent = {
      current: jest.fn().mockResolvedValue([]),
      grant: jest.fn().mockResolvedValue('granted'),
      withdraw: jest.fn().mockResolvedValue('withdrawn'),
    };
    audit = { verifyChain: jest.fn().mockResolvedValue({ ok: true, checked: 0 }) };
    controller = new ComplianceController(dataSubject as never, consent as never, audit as never);
  });

  it('exportMine / eraseMine / myConsent scope to the current user', async () => {
    await controller.exportMine(user);
    await controller.eraseMine(user);
    await controller.myConsent(user);
    expect(dataSubject.exportData).toHaveBeenCalledWith('u1');
    expect(dataSubject.erase).toHaveBeenCalledWith('u1');
    expect(consent.current).toHaveBeenCalledWith('u1');
  });

  it('updateConsent grants when granted=true, withdraws when false', async () => {
    await controller.updateConsent(user, { purpose: 'm', granted: true } as any, req);
    expect(consent.grant).toHaveBeenCalledWith(
      'u1',
      'm',
      expect.objectContaining({ ipAddress: '9.9.9.9' }),
    );

    await controller.updateConsent(user, { purpose: 'm', granted: false } as any, req);
    expect(consent.withdraw).toHaveBeenCalledWith('u1', 'm', expect.anything());
  });

  it('prefers cf-connecting-ip / x-forwarded-for over req.ip', async () => {
    const fwd = { headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }, ip: '9.9.9.9' } as any;
    await controller.updateConsent(user, { purpose: 'm', granted: true } as any, fwd);
    expect(consent.grant).toHaveBeenCalledWith(
      'u1',
      'm',
      expect.objectContaining({ ipAddress: '1.1.1.1' }),
    );
  });

  it('verify delegates to the audit chain check', async () => {
    expect(await controller.verify()).toEqual({ ok: true, checked: 0 });
  });
});
