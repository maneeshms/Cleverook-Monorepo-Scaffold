import { UsersController } from './users.controller';

describe('UsersController', () => {
  const users = {
    getByIdOrFail: jest.fn().mockResolvedValue({
      id: 'u1',
      email: 'a@b.co',
      displayName: 'Alex',
      role: 'USER',
      createdAt: new Date(),
      lastLoginAt: null,
      passwordHash: 'should-not-leak',
    }),
    updateProfile: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.co', displayName: 'New' }),
    exportUserData: jest.fn().mockResolvedValue({ profile: {} }),
    softDeleteAccount: jest.fn(),
    findAllPaginated: jest.fn().mockResolvedValue({ data: [], meta: {} }),
  };
  const controller = new UsersController(users as never);
  const current = { sub: 'u1', email: 'a@b.co', role: 'USER', sessionId: 's1' };

  it('me returns a safe projection (no password hash)', async () => {
    const me = await controller.me(current);
    expect(me).toMatchObject({ id: 'u1', email: 'a@b.co' });
    expect(me).not.toHaveProperty('passwordHash');
  });

  it('updateProfile scopes to the current user', async () => {
    await controller.updateProfile(current, { displayName: 'New' });
    expect(users.updateProfile).toHaveBeenCalledWith('u1', { displayName: 'New' });
  });

  it('export and delete act on the current user only', async () => {
    await controller.exportData(current);
    expect(users.exportUserData).toHaveBeenCalledWith('u1');
    await controller.deleteAccount(current);
    expect(users.softDeleteAccount).toHaveBeenCalledWith('u1');
  });

  it('list delegates to the paginated query', async () => {
    await controller.list({ page: 1, limit: 20 } as never);
    expect(users.findAllPaginated).toHaveBeenCalled();
  });
});
