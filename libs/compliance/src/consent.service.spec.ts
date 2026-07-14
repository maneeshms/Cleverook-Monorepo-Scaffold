import { ConsentService } from './consent.service';

describe('ConsentService', () => {
  let rows: any[];
  let repo: any;
  let audit: { record: jest.Mock };
  let service: ConsentService;

  beforeEach(() => {
    rows = [];
    repo = {
      create: (o: any) => o,
      save: async (o: any) => {
        const row = { ...o, createdAt: o.createdAt ?? new Date() };
        rows.push(row);
        return row;
      },
      find: async ({ where, order }: any) => {
        let out = rows.filter((r) => r.userId === where.userId);
        if (where.purpose) out = out.filter((r) => r.purpose === where.purpose);
        out = [...out].sort((a, b) => a.createdAt - b.createdAt);
        if (order?.createdAt === 'DESC') out.reverse();
        return out;
      },
      findOne: async ({ where }: any) => {
        const out = rows
          .filter((r) => r.userId === where.userId && r.purpose === where.purpose)
          .sort((a, b) => b.createdAt - a.createdAt);
        return out[0] ?? null;
      },
    };
    audit = { record: jest.fn() };
    service = new ConsentService(repo, audit as never);
  });

  it('grant appends a granted row and audits it', async () => {
    await service.grant('u1', 'marketing_email', { source: 'signup', ipAddress: '1.2.3.4' });
    expect(rows[0]).toMatchObject({ userId: 'u1', purpose: 'marketing_email', granted: true });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'consent.grant', resourceId: 'marketing_email' }),
    );
  });

  it('withdraw appends a withdrawn row and audits it', async () => {
    await service.withdraw('u1', 'marketing_email');
    expect(rows[0].granted).toBe(false);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'consent.withdraw' }),
    );
  });

  it('current returns the newest state per purpose', async () => {
    await service.grant('u1', 'marketing_email');
    await new Promise((r) => setTimeout(r, 2));
    await service.withdraw('u1', 'marketing_email');
    await service.grant('u1', 'analytics');
    const current = await service.current('u1');
    expect(current).toEqual(
      expect.arrayContaining([
        { purpose: 'marketing_email', granted: false, since: expect.any(Date) },
        { purpose: 'analytics', granted: true, since: expect.any(Date) },
      ]),
    );
    expect(current).toHaveLength(2);
  });

  it('isGranted reflects the latest row; defaults to false with no record', async () => {
    expect(await service.isGranted('u1', 'marketing_email')).toBe(false);
    await service.grant('u1', 'marketing_email');
    expect(await service.isGranted('u1', 'marketing_email')).toBe(true);
  });

  it('history returns all rows for the subject', async () => {
    await service.grant('u1', 'a');
    await service.grant('u1', 'b');
    expect(await service.history('u1')).toHaveLength(2);
  });
});
