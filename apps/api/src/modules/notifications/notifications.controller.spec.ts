import { NotificationsController } from './notifications.controller';

describe('NotificationsController', () => {
  const notifications = {
    list: jest.fn(),
    unreadCount: jest.fn().mockResolvedValue(4),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
  };
  const controller = new NotificationsController(notifications as never);
  const user = { sub: 'u1', email: 'a@b.co', role: 'USER', sessionId: 's1' };
  const id = '9d3f4d3e-0000-4000-8000-000000000000';

  it('scopes every route to the current user', async () => {
    await controller.list(user, { page: 1 } as never);
    expect(notifications.list).toHaveBeenCalledWith('u1', { page: 1 });

    await expect(controller.unreadCount(user)).resolves.toEqual({ unread: 4 });

    await controller.markRead(user, id);
    expect(notifications.markRead).toHaveBeenCalledWith(id, 'u1');

    await controller.markAllRead(user);
    expect(notifications.markAllRead).toHaveBeenCalledWith('u1');
  });
});
