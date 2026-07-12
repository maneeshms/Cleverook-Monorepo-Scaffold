import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { Notification } from './entities/notification.entity';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let repo: Record<string, jest.Mock>;

  const notification = (overrides: Partial<Notification> = {}): Notification =>
    ({
      id: 'n1',
      userId: 'u1',
      type: 'TASK_ASSIGNED',
      title: 'New task',
      body: null,
      payload: null,
      readAt: null,
      ...overrides,
    }) as Notification;

  beforeEach(() => {
    repo = {
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => ({ id: 'n1', ...row })),
      findAndCount: jest.fn().mockResolvedValue([[notification()], 1]),
      findOne: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(2),
      update: jest.fn().mockResolvedValue({ affected: 3 }),
    };
    service = new NotificationsService(repo as never);
  });

  it('deliver (InAppSink) persists the message and returns the row id', async () => {
    const id = await service.deliver({
      userId: 'u9',
      type: 'TASK_ASSIGNED',
      title: 'New task: Ship it',
      body: 'from the messaging engine',
      payload: { taskId: 't1' },
    });
    expect(id).toBe('n1');
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u9', title: 'New task: Ship it' }),
    );
  });

  it('deliver defaults optional fields to null', async () => {
    await service.deliver({ userId: 'u9', title: 'Bare' });
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ type: null, body: null, payload: null }),
    );
  });

  it('list returns the paginated envelope, newest first, scoped to the user', async () => {
    const result = await service.list('u1', { page: 1, limit: 20, skip: 0 } as never);
    expect(repo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' }, order: { createdAt: 'DESC' } }),
    );
    expect(result.meta.total).toBe(1);
  });

  it('unreadCount counts unread rows only', async () => {
    await expect(service.unreadCount('u1')).resolves.toBe(2);
  });

  describe('markRead', () => {
    it('404s when the notification does not belong to the user', async () => {
      await expect(service.markRead('n1', 'intruder')).rejects.toThrow(NotFoundException);
    });

    it('stamps readAt once and is idempotent', async () => {
      repo.findOne.mockResolvedValue(notification());
      const first = await service.markRead('n1', 'u1');
      expect(first.readAt).toBeInstanceOf(Date);
      expect(repo.save).toHaveBeenCalledTimes(1);

      repo.findOne.mockResolvedValue(notification({ readAt: new Date() }));
      await service.markRead('n1', 'u1');
      expect(repo.save).toHaveBeenCalledTimes(1); // not saved again
    });
  });

  it('markAllRead reports how many rows changed', async () => {
    await expect(service.markAllRead('u1')).resolves.toEqual({ updated: 3 });
  });
});
