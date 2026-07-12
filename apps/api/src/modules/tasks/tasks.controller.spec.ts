import { TasksController } from './tasks.controller';

describe('TasksController', () => {
  const tasks = {
    create: jest.fn(),
    findAllForUser: jest.fn(),
    findOneForUser: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getStats: jest.fn(),
  };
  const controller = new TasksController(tasks as never);
  const user = { sub: 'u1', email: 'a@b.co', role: 'USER', sessionId: 's1' };
  const id = '9d3f4d3e-0000-4000-8000-000000000000';

  it('routes every operation scoped to the current user', async () => {
    await controller.create(user, { title: 'T' } as never);
    expect(tasks.create).toHaveBeenCalledWith('u1', { title: 'T' });

    await controller.list(user, { page: 1 } as never);
    expect(tasks.findAllForUser).toHaveBeenCalledWith('u1', { page: 1 });

    await controller.stats(user);
    expect(tasks.getStats).toHaveBeenCalledWith('u1');

    await controller.findOne(user, id);
    expect(tasks.findOneForUser).toHaveBeenCalledWith(id, 'u1');

    await controller.update(user, id, { title: 'X' } as never);
    expect(tasks.update).toHaveBeenCalledWith(id, 'u1', { title: 'X' });

    await controller.remove(user, id);
    expect(tasks.remove).toHaveBeenCalledWith(id, 'u1');
  });
});
