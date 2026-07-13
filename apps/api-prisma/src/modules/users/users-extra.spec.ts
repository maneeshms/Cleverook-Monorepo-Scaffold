import { UsersController } from './users.controller';

describe('UsersController (prisma)', () => {
  const users = {
    getByIdOrFail: jest.fn().mockResolvedValue({
      id: 'u1',
      email: 'a@b.co',
      displayName: 'Alex',
      role: 'USER',
      createdAt: new Date(),
      lastLoginAt: null,
      passwordHash: 'never-shown',
    }),
    updateProfile: jest.fn().mockResolvedValue({
      id: 'u1',
      email: 'a@b.co',
      displayName: 'New',
      role: 'USER',
      createdAt: new Date(),
      lastLoginAt: null,
      passwordHash: 'never-shown',
    }),
    softDeleteAccount: jest.fn(),
  };
  const controller = new UsersController(users as never);
  const current = { sub: 'u1', email: 'a@b.co', role: 'USER', sessionId: 's1' };

  it('serves safe projections scoped to the current user', async () => {
    const me = await controller.me(current);
    expect(me).not.toHaveProperty('passwordHash');
    const updated = await controller.updateProfile(current, { displayName: 'New' });
    expect(updated.displayName).toBe('New');
    await controller.deleteAccount(current);
    expect(users.softDeleteAccount).toHaveBeenCalledWith('u1');
  });
});
