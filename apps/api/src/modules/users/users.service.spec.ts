import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';

describe('UsersService', () => {
  let service: UsersService;
  let repo: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    softRemove: jest.Mock;
  };
  let qb: Record<string, jest.Mock>;

  const user = (overrides: Partial<User> = {}): User =>
    ({
      id: 'u1',
      email: 'a@b.co',
      displayName: 'Alex',
      role: 'USER',
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      createdAt: new Date(),
      sessions: [],
      ...overrides,
    }) as never;

  beforeEach(() => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => row),
      update: jest.fn(),
      softRemove: jest.fn(),
    };
    service = new UsersService(repo as never);
  });

  it('findByEmail lowercases and only selects the hash when asked', async () => {
    await service.findByEmail('USER@Example.COM');
    expect(qb.where).toHaveBeenCalledWith('user.email = :email', {
      email: 'user@example.com',
    });
    expect(qb.addSelect).not.toHaveBeenCalled();

    await service.findByEmail('USER@Example.COM', true);
    expect(qb.addSelect).toHaveBeenCalledWith('user.passwordHash');
  });

  it('getByIdOrFail throws 404 for unknown ids', async () => {
    await expect(service.getByIdOrFail('nope')).rejects.toThrow(NotFoundException);
    repo.findOne.mockResolvedValue(user());
    await expect(service.getByIdOrFail('u1')).resolves.toMatchObject({ id: 'u1' });
  });

  it('create normalizes the email', async () => {
    await service.create({ email: 'MiXeD@Case.Co', passwordHash: 'h' });
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ email: 'mixed@case.co' }));
  });

  it('updateProfile only touches provided fields', async () => {
    repo.findOne.mockResolvedValue(user());
    const updated = await service.updateProfile('u1', {});
    expect(updated.displayName).toBe('Alex');
    const renamed = await service.updateProfile('u1', { displayName: 'New Name' });
    expect(renamed.displayName).toBe('New Name');
  });

  it('exportUserData returns profile + sessions and 404s on unknown user', async () => {
    await expect(service.exportUserData('ghost')).rejects.toThrow(NotFoundException);
    repo.findOne.mockResolvedValue(
      user({
        sessions: [
          { id: 's1', ipAddress: 'ip', userAgent: 'ua', createdAt: new Date(), lastUsedAt: null },
        ] as never,
      }),
    );
    const exported = await service.exportUserData('u1');
    expect(exported.profile).toMatchObject({ id: 'u1', email: 'a@b.co' });
    expect((exported.sessions as unknown[]).length).toBe(1);
    expect(exported.exportedAt).toBeDefined();
  });

  it('softDeleteAccount soft-removes, never hard-deletes', async () => {
    repo.findOne.mockResolvedValue(user());
    await service.softDeleteAccount('u1');
    expect(repo.softRemove).toHaveBeenCalled();
  });

  it('recordSuccessfulLogin resets the lockout state', async () => {
    await service.recordSuccessfulLogin('u1');
    expect(repo.update).toHaveBeenCalledWith('u1', {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: expect.any(Date),
    });
  });

  describe('lockout', () => {
    it('does not lock below the attempt threshold', async () => {
      const u = user({ failedLoginAttempts: 2 });
      await service.recordFailedLogin(u);
      expect(u.failedLoginAttempts).toBe(3);
      expect(u.lockedUntil).toBeNull();
    });

    it('locks at the threshold with a growing, capped duration', async () => {
      const u = user({ failedLoginAttempts: 4 });
      await service.recordFailedLogin(u);
      expect(u.lockedUntil).toBeInstanceOf(Date);

      const heavy = user({ failedLoginAttempts: 99 });
      await service.recordFailedLogin(heavy);
      const minutes = (heavy.lockedUntil!.getTime() - Date.now()) / 60_000;
      expect(minutes).toBeLessThanOrEqual(15.1); // capped at 15 min
    });

    it('isLocked respects expiry', () => {
      expect(service.isLocked(user())).toBe(false);
      expect(service.isLocked(user({ lockedUntil: new Date(Date.now() + 60_000) }))).toBe(true);
      expect(service.isLocked(user({ lockedUntil: new Date(Date.now() - 60_000) }))).toBe(false);
    });
  });

  it('findAllPaginated returns the standard envelope with safe projections', async () => {
    qb.getManyAndCount.mockResolvedValue([[user()], 1]);
    const query = Object.assign(Object.create(Object.getPrototypeOf({})), {
      page: 1,
      limit: 20,
      skip: 0,
      search: 'alex',
    });
    const result = await service.findAllPaginated(query as never);
    expect(qb.where).toHaveBeenCalledWith(expect.stringContaining('ILIKE'), {
      search: '%alex%',
    });
    expect(result.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
    expect(result.data[0]).not.toHaveProperty('passwordHash');
    expect(result.data[0]).toMatchObject({ id: 'u1', email: 'a@b.co' });
  });

  it('findAllPaginated works without a search filter', async () => {
    const query = { page: 2, limit: 10, skip: 10 };
    await service.findAllPaginated(query as never);
    expect(qb.where).not.toHaveBeenCalled();
    expect(qb.skip).toHaveBeenCalledWith(10);
  });
});
