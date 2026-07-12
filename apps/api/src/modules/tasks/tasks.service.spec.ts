import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MessageType } from '@clevscaffold/messaging';
import { TasksService } from './tasks.service';
import { Task, TaskStatus } from './entities/task.entity';

describe('TasksService', () => {
  let service: TasksService;
  let repo: Record<string, jest.Mock>;
  let qb: Record<string, jest.Mock>;
  let users: { getByIdOrFail: jest.Mock; findById: jest.Mock };
  let messaging: { dispatch: jest.Mock };
  let redisClient: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let redisEnabled: boolean;
  let logger: { error: jest.Mock };

  const task = (overrides: Partial<Task> = {}): Task =>
    ({
      id: 't1',
      title: 'Ship it',
      description: null,
      status: TaskStatus.TODO,
      ownerId: 'owner',
      assigneeId: null,
      dueDate: null,
      ...overrides,
    }) as Task;

  beforeEach(() => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    repo = {
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => ({ id: 't1', ...row })),
      findOne: jest.fn().mockResolvedValue(null),
      softRemove: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    users = {
      getByIdOrFail: jest.fn().mockResolvedValue({ id: 'assignee', email: 'as@b.co' }),
      findById: jest.fn(async (id: string) => ({
        id,
        email: `${id}@b.co`,
        displayName: id === 'owner' ? 'The Owner' : null,
      })),
    };
    messaging = { dispatch: jest.fn().mockResolvedValue(undefined) };
    redisClient = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    redisEnabled = false;
    logger = { error: jest.fn() };
    const redis = {
      isEnabled: () => redisEnabled,
      get client() {
        return redisEnabled ? redisClient : null;
      },
    };
    const config = { get: () => 'http://localhost:5173' };
    service = new TasksService(
      repo as never,
      users as never,
      messaging as never,
      redis as never,
      config as never,
      logger as never,
    );
  });

  describe('create', () => {
    it('creates an unassigned task without notifying anyone', async () => {
      const created = await service.create('owner', { title: 'Solo work' });
      expect(created.ownerId).toBe('owner');
      expect(messaging.dispatch).not.toHaveBeenCalled();
    });

    it('validates the assignee and fans out email + in-app on assignment', async () => {
      await service.create('owner', { title: 'Ship it', assigneeId: 'assignee' });
      expect(users.getByIdOrFail).toHaveBeenCalledWith('assignee');
      expect(messaging.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          messageType: MessageType.TASK_ASSIGNED,
          userId: 'assignee',
          recipient: { email: 'assignee@b.co' },
          variables: expect.objectContaining({ assignerName: 'The Owner', taskTitle: 'Ship it' }),
          metadata: expect.objectContaining({ notificationType: 'TASK_ASSIGNED' }),
        }),
      );
    });

    it('does not notify on self-assignment', async () => {
      await service.create('owner', { title: 'Mine', assigneeId: 'owner' });
      expect(messaging.dispatch).not.toHaveBeenCalled();
    });

    it('parses dueDate', async () => {
      const created = await service.create('owner', {
        title: 'Deadline',
        dueDate: '2026-08-01T12:00:00Z',
      });
      expect(created.dueDate).toEqual(new Date('2026-08-01T12:00:00Z'));
    });
  });

  describe('findAllForUser / findOneForUser', () => {
    it('always scopes the list to owner-or-assignee', async () => {
      await service.findAllForUser('u1', { page: 1, limit: 20, skip: 0 } as never);
      expect(qb.where).toHaveBeenCalledWith(expect.stringContaining('owner_id'), { userId: 'u1' });
    });

    it('applies status and search filters', async () => {
      await service.findAllForUser('u1', {
        page: 1,
        limit: 20,
        skip: 0,
        status: TaskStatus.DONE,
        search: 'ship',
      } as never);
      expect(qb.andWhere).toHaveBeenCalledWith('task.status = :status', {
        status: TaskStatus.DONE,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('task.title ILIKE :search', { search: '%ship%' });
    });

    it("404s for missing AND for other users' tasks (no id oracle)", async () => {
      await expect(service.findOneForUser('ghost', 'u1')).rejects.toThrow(NotFoundException);
      repo.findOne.mockResolvedValue(task({ ownerId: 'someone-else' }));
      await expect(service.findOneForUser('t1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('lets owner and assignee read', async () => {
      repo.findOne.mockResolvedValue(task({ assigneeId: 'helper' }));
      await expect(service.findOneForUser('t1', 'owner')).resolves.toBeDefined();
      await expect(service.findOneForUser('t1', 'helper')).resolves.toBeDefined();
    });
  });

  describe('update', () => {
    it('lets the owner update any field and notifies a new assignee', async () => {
      repo.findOne.mockResolvedValue(task());
      const updated = await service.update('t1', 'owner', {
        title: 'Renamed',
        assigneeId: 'assignee',
        status: TaskStatus.IN_PROGRESS,
        description: 'notes',
        dueDate: '2026-09-01T00:00:00Z',
      });
      expect(updated.title).toBe('Renamed');
      expect(updated.status).toBe(TaskStatus.IN_PROGRESS);
      expect(messaging.dispatch).toHaveBeenCalled();
    });

    it('does not re-notify an unchanged assignee', async () => {
      repo.findOne.mockResolvedValue(task({ assigneeId: 'assignee' }));
      await service.update('t1', 'owner', { status: TaskStatus.DONE });
      expect(messaging.dispatch).not.toHaveBeenCalled();
    });

    it('lets an assignee update status but nothing else', async () => {
      repo.findOne.mockResolvedValue(task({ assigneeId: 'helper' }));
      await expect(
        service.update('t1', 'helper', { status: TaskStatus.DONE }),
      ).resolves.toBeDefined();
      repo.findOne.mockResolvedValue(task({ assigneeId: 'helper' }));
      await expect(service.update('t1', 'helper', { title: 'hijack' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('supports unassigning (assigneeId: null clears without notifying)', async () => {
      repo.findOne.mockResolvedValue(task({ assigneeId: 'assignee' }));
      const updated = await service.update('t1', 'owner', { assigneeId: null as never });
      expect(updated.assigneeId).toBeNull();
      expect(messaging.dispatch).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('soft-deletes for the owner', async () => {
      repo.findOne.mockResolvedValue(task());
      await service.remove('t1', 'owner');
      expect(repo.softRemove).toHaveBeenCalled();
    });

    it('forbids assignees from deleting', async () => {
      repo.findOne.mockResolvedValue(task({ assigneeId: 'helper' }));
      await expect(service.remove('t1', 'helper')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getStats (cache-aside)', () => {
    const rawRows = [
      { status: TaskStatus.TODO, count: '2' },
      { status: TaskStatus.DONE, count: '1' },
    ];

    it('computes from the DB when Redis is off (no fake cache)', async () => {
      qb.getRawMany.mockResolvedValue(rawRows);
      const stats = await service.getStats('u1');
      expect(stats).toEqual({
        total: 3,
        byStatus: { TODO: 2, IN_PROGRESS: 0, DONE: 1 },
      });
      expect(redisClient.get).not.toHaveBeenCalled();
    });

    it('serves from cache on a hit', async () => {
      redisEnabled = true;
      redisClient.get.mockResolvedValue(JSON.stringify({ total: 9, byStatus: {} }));
      const stats = await service.getStats('u1');
      expect(stats.total).toBe(9);
      expect(qb.getRawMany).not.toHaveBeenCalled();
    });

    it('fills the cache on a miss', async () => {
      redisEnabled = true;
      qb.getRawMany.mockResolvedValue(rawRows);
      await service.getStats('u1');
      expect(redisClient.set).toHaveBeenCalledWith(
        'tasks:stats:u1',
        expect.any(String),
        'EX',
        30,
      );
    });

    it('invalidates affected users on writes', async () => {
      redisEnabled = true;
      repo.findOne.mockResolvedValue(task({ assigneeId: 'helper' }));
      await service.remove('t1', 'owner');
      expect(redisClient.del).toHaveBeenCalledWith('tasks:stats:owner', 'tasks:stats:helper');
    });
  });

  it('logs but never throws when the assignment dispatch fails', async () => {
    messaging.dispatch.mockRejectedValue(new Error('smtp down'));
    await expect(
      service.create('owner', { title: 'Ship it', assigneeId: 'assignee' }),
    ).resolves.toBeDefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('dispatch failed'),
      undefined,
      'Tasks',
    );
  });

  it('skips notification silently when the assignee vanished', async () => {
    users.findById.mockResolvedValue(null);
    await service.create('owner', { title: 'Ship it', assigneeId: 'assignee' });
    expect(messaging.dispatch).not.toHaveBeenCalled();
  });
});
