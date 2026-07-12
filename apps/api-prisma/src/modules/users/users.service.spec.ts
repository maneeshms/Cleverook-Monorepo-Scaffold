import { NotFoundException } from '@nestjs/common';
import { toProfile, UsersService } from './users.service';

describe('UsersService (prisma)', () => {
  let service: UsersService;
  let userModel: Record<string, jest.Mock>;

  const user = (overrides: Record<string, unknown> = {}) => ({
    id: 'u1',
    email: 'a@b.co',
    passwordHash: 'hash',
    displayName: 'Alex',
    role: 'USER',
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: new Date(),
    deletedAt: null,
    ...overrides,
  });

  beforeEach(() => {
    userModel = {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }) => user(data)),
      update: jest.fn(async ({ data }) => user(data)),
    };
    service = new UsersService({ user: userModel } as never);
  });

  it('findByEmail lowercases and excludes soft-deleted accounts', async () => {
    await service.findByEmail('USER@X.CO');
    expect(userModel.findFirst).toHaveBeenCalledWith({
      where: { email: 'user@x.co', deletedAt: null },
    });
  });

  it('getByIdOrFail 404s on unknown/deleted users', async () => {
    await expect(service.getByIdOrFail('ghost')).rejects.toThrow(NotFoundException);
    userModel.findFirst.mockResolvedValue(user());
    await expect(service.getByIdOrFail('u1')).resolves.toMatchObject({ id: 'u1' });
  });

  it('create normalizes the email', async () => {
    await service.create({ email: 'MiXeD@Case.Co', passwordHash: 'h' });
    expect(userModel.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: 'mixed@case.co' }),
    });
  });

  it('updateProfile verifies existence first', async () => {
    await expect(service.updateProfile('ghost', { displayName: 'X' })).rejects.toThrow(
      NotFoundException,
    );
    userModel.findFirst.mockResolvedValue(user());
    await service.updateProfile('u1', { displayName: 'X' });
    expect(userModel.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { displayName: 'X' },
    });
  });

  it('softDeleteAccount stamps deleted_at instead of deleting', async () => {
    userModel.findFirst.mockResolvedValue(user());
    await service.softDeleteAccount('u1');
    expect(userModel.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('recordSuccessfulLogin resets lockout counters', async () => {
    await service.recordSuccessfulLogin('u1');
    expect(userModel.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: expect.any(Date) },
    });
  });

  describe('lockout', () => {
    it('does not lock below the threshold', async () => {
      const u = user({ failedLoginAttempts: 2 }) as never;
      await service.recordFailedLogin(u);
      expect((u as { lockedUntil: Date | null }).lockedUntil).toBeNull();
    });

    it('locks at the threshold with a capped duration', async () => {
      const u = user({ failedLoginAttempts: 99 }) as never;
      await service.recordFailedLogin(u);
      const lockedUntil = (u as { lockedUntil: Date }).lockedUntil;
      expect(lockedUntil).toBeInstanceOf(Date);
      expect((lockedUntil.getTime() - Date.now()) / 60_000).toBeLessThanOrEqual(15.1);
    });

    it('isLocked respects expiry', () => {
      expect(service.isLocked(user() as never)).toBe(false);
      expect(
        service.isLocked(user({ lockedUntil: new Date(Date.now() + 60_000) }) as never),
      ).toBe(true);
      expect(
        service.isLocked(user({ lockedUntil: new Date(Date.now() - 60_000) }) as never),
      ).toBe(false);
    });
  });

  it('toProfile never exposes the password hash', () => {
    const profile = toProfile(user() as never);
    expect(profile).not.toHaveProperty('passwordHash');
    expect(profile).toMatchObject({ id: 'u1', email: 'a@b.co', role: 'USER' });
  });
});
