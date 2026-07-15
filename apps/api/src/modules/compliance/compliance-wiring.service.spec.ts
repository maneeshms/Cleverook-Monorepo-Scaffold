import { PersonalDataRegistry, RetentionRegistry } from '@clevrook/compliance';
import { ComplianceWiringService } from './compliance-wiring.service';

describe('ComplianceWiringService', () => {
  let users: any;
  // clevscaffold:tasks:start
  let tasks: any;
  // clevscaffold:tasks:end
  // clevscaffold:messaging:start
  let notifications: any;
  let deviceTokens: any;
  // clevscaffold:messaging:end
  let personalData: PersonalDataRegistry;
  let retention: RetentionRegistry;
  let service: ComplianceWiringService;

  beforeEach(() => {
    users = {
      findOne: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.co' }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
      find: jest.fn().mockResolvedValue([]),
    };
    // clevscaffold:tasks:start
    tasks = {
      find: jest.fn().mockResolvedValue([{ id: 't1' }]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 2 }),
    };
    // clevscaffold:tasks:end
    // clevscaffold:messaging:start
    notifications = {
      find: jest.fn().mockResolvedValue([{ id: 'n1' }]),
      delete: jest.fn().mockResolvedValue({ affected: 3 }),
    };
    deviceTokens = {
      listForUser: jest.fn().mockResolvedValue([{ id: 'd1', platform: 'ANDROID' }]),
      eraseForUser: jest.fn().mockResolvedValue(2),
      purgeStale: jest.fn().mockResolvedValue(4),
    };
    // clevscaffold:messaging:end
    personalData = new PersonalDataRegistry();
    retention = new RetentionRegistry();
    service = new ComplianceWiringService(
      users,
      personalData,
      retention,
      // clevscaffold:tasks:start
      tasks,
      // clevscaffold:tasks:end
      // clevscaffold:messaging:start
      notifications,
      deviceTokens,
      // clevscaffold:messaging:end
    );
    service.onModuleInit();
  });

  it('registers the profile contributor + soft-deleted-users retention target', () => {
    expect(personalData.list().some((c) => c.key === 'profile')).toBe(true);
    expect(retention.list().some((t) => t.key === 'soft-deleted-users')).toBe(true);
  });

  it('profile export loads the user; erase anonymises then soft-deletes', async () => {
    const profile = personalData.list().find((c) => c.key === 'profile')!;
    await profile.collect('u1');
    expect(users.findOne).toHaveBeenCalledWith({ where: { id: 'u1' } });

    const affected = await profile.erase('u1');
    expect(users.update).toHaveBeenCalledWith(
      { id: 'u1' },
      expect.objectContaining({
        email: 'erased-u1@erased.invalid',
        displayName: null,
        passwordHash: null,
      }),
    );
    expect(users.softDelete).toHaveBeenCalledWith({ id: 'u1' });
    expect(affected).toBe(1);
  });

  it('profile erase count falls back to 0 when the driver omits affected', async () => {
    users.update.mockResolvedValue({});
    const profile = personalData.list().find((c) => c.key === 'profile')!;
    expect(await profile.erase('u1')).toBe(0);
  });

  it('soft-deleted-users retention anonymises only non-tombstoned rows (idempotent)', async () => {
    users.find.mockResolvedValue([
      { id: 'u1', email: 'real@b.co' },
      { id: 'u2', email: 'erased-u2@erased.invalid' },
    ]);
    const target = retention.list().find((x) => x.key === 'soft-deleted-users')!;
    const n = await target.purge(new Date());
    expect(users.update).toHaveBeenCalledTimes(1); // only u1
    expect(n).toBe(1);
    expect(target.windowDays({ softDeletedUserGraceDays: 30 } as any)).toBe(30);
  });

  // clevscaffold:tasks:start
  it('registers the tasks contributor; erase deletes owned + detaches assigned', async () => {
    const t = personalData.list().find((c) => c.key === 'tasks')!;
    const n = await t.erase('u1');
    expect(tasks.update).toHaveBeenCalledWith({ assigneeId: 'u1' }, { assigneeId: null });
    expect(tasks.delete).toHaveBeenCalledWith({ ownerId: 'u1' });
    expect(n).toBe(2);
    tasks.delete.mockResolvedValue({});
    expect(await t.erase('u1')).toBe(0);
  });
  // clevscaffold:tasks:end

  // clevscaffold:messaging:start
  it('registers the notifications contributor + retention', async () => {
    const c = personalData.list().find((x) => x.key === 'notifications')!;
    expect(await c.erase('u1')).toBe(3);
    expect(notifications.delete).toHaveBeenCalledWith({ userId: 'u1' });

    const target = retention.list().find((x) => x.key === 'notifications')!;
    await target.purge(new Date());
    expect(notifications.delete).toHaveBeenCalledWith({ createdAt: expect.anything() });
    expect(target.windowDays({ notificationDays: 180 } as any)).toBe(180);
    notifications.delete.mockResolvedValue({});
    expect(await target.purge(new Date())).toBe(0);
  });

  it('registers the devices contributor + stale-token retention', async () => {
    const c = personalData.list().find((x) => x.key === 'devices')!;
    await c.collect('u1');
    expect(deviceTokens.listForUser).toHaveBeenCalledWith('u1');
    expect(await c.erase('u1')).toBe(2);
    expect(deviceTokens.eraseForUser).toHaveBeenCalledWith('u1');

    const target = retention.list().find((x) => x.key === 'device-tokens')!;
    const cutoff = new Date('2026-01-01');
    expect(await target.purge(cutoff)).toBe(4);
    expect(deviceTokens.purgeStale).toHaveBeenCalledWith(cutoff);
    expect(target.windowDays({ deviceTokenDays: 270 } as any)).toBe(270);
  });
  // clevscaffold:messaging:end
});
