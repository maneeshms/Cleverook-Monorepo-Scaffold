import { DevicePlatform } from '../enums/device-platform.enum';
import { DeviceToken } from '../entities/device-token.entity';
import { DeviceTokenService, MAX_DEVICES_PER_USER } from './device-token.service';

describe('DeviceTokenService', () => {
  let repo: {
    findOne: jest.Mock;
    find: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let service: DeviceTokenService;

  beforeEach(() => {
    repo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((row: Partial<DeviceToken>) => row as DeviceToken),
      save: jest.fn(async (row: DeviceToken) => row),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    service = new DeviceTokenService(repo as never);
  });

  it('registers a new device with a fresh lastSeenAt', async () => {
    const saved = await service.register('u1', 'tok-android-1', DevicePlatform.ANDROID);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        token: 'tok-android-1',
        platform: DevicePlatform.ANDROID,
        lastSeenAt: expect.any(Date),
      }),
    );
    expect(saved.token).toBe('tok-android-1');
  });

  it('re-registering an existing token moves it to the new user (device changed hands)', async () => {
    const existing = {
      id: 'row1',
      userId: 'old-user',
      token: 'tok-shared',
      platform: DevicePlatform.IOS,
      lastSeenAt: new Date(0),
    } as DeviceToken;
    repo.findOne.mockResolvedValue(existing);

    await service.register('new-user', 'tok-shared', DevicePlatform.ANDROID);

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'row1',
        userId: 'new-user',
        platform: DevicePlatform.ANDROID,
      }),
    );
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('evicts the stalest registration at the per-user cap', async () => {
    repo.count.mockResolvedValue(MAX_DEVICES_PER_USER);
    repo.find.mockResolvedValue([{ id: 'stalest-row' }]);

    await service.register('u1', 'tok-new', DevicePlatform.WEB);

    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({ order: { lastSeenAt: 'ASC' }, take: 1 }),
    );
    expect(repo.delete).toHaveBeenCalledWith({ id: 'stalest-row' });
    expect(repo.save).toHaveBeenCalled();
  });

  it('registers without eviction when the cap query returns no row', async () => {
    repo.count.mockResolvedValue(MAX_DEVICES_PER_USER);
    repo.find.mockResolvedValue([]);
    await service.register('u1', 'tok-new', DevicePlatform.WEB);
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('unregister is scoped to the calling user (BOLA-safe)', async () => {
    const affected = await service.unregister('u1', 'tok-x');
    expect(repo.delete).toHaveBeenCalledWith({ userId: 'u1', token: 'tok-x' });
    expect(affected).toBe(1);
  });

  it('unregister returns 0 when nothing matched', async () => {
    repo.delete.mockResolvedValue({ affected: undefined });
    await expect(service.unregister('u1', 'tok-x')).resolves.toBe(0);
  });

  it('tokensForUser maps registrations to raw tokens, newest first', async () => {
    repo.find.mockResolvedValue([{ token: 'newer' }, { token: 'older' }]);
    await expect(service.tokensForUser('u1')).resolves.toEqual(['newer', 'older']);
    expect(repo.find).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      order: { lastSeenAt: 'DESC' },
    });
  });

  it('removeToken deletes by token regardless of owner', async () => {
    await service.removeToken('dead-token');
    expect(repo.delete).toHaveBeenCalledWith({ token: 'dead-token' });
  });

  it('purgeStale deletes registrations older than the cutoff and reports the count', async () => {
    repo.delete.mockResolvedValue({ affected: 3 });
    await expect(service.purgeStale(new Date('2026-01-01'))).resolves.toBe(3);
  });

  it('eraseForUser deletes all of a user’s registrations (GDPR)', async () => {
    repo.delete.mockResolvedValue({ affected: 2 });
    await expect(service.eraseForUser('u1')).resolves.toBe(2);
    expect(repo.delete).toHaveBeenCalledWith({ userId: 'u1' });
  });
});
