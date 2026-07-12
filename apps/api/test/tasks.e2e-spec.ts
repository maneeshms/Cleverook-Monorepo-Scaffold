import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, resetDatabase, uniqueUser } from './helpers/e2e-app';

describe('Tasks + notifications (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const api = () => request(app.getHttpServer());

  async function registerUser(prefix = 'task') {
    const user = uniqueUser(prefix);
    const res = await api().post('/api/v1/auth/register').send(user).expect(201);
    const me = await api()
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
    return { ...user, ...res.body, id: me.body.id as string };
  }

  beforeAll(async () => {
    ({ app, dataSource } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
  });

  it('full lifecycle: create → list (filtered/paginated) → update → stats → delete', async () => {
    const alice = await registerUser('alice');
    const auth = { Authorization: `Bearer ${alice.accessToken}` };

    const created = await api()
      .post('/api/v1/tasks')
      .set(auth)
      .send({ title: 'Write the docs', description: 'agents + humans' })
      .expect(201);
    expect(created.body.status).toBe('TODO');

    await api().post('/api/v1/tasks').set(auth).send({ title: 'Another one' }).expect(201);

    const list = await api().get('/api/v1/tasks?limit=1&page=1').set(auth).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.meta).toMatchObject({ total: 2, page: 1, limit: 1, totalPages: 2 });

    const filtered = await api().get('/api/v1/tasks?search=docs').set(auth).expect(200);
    expect(filtered.body.meta.total).toBe(1);

    const updated = await api()
      .patch(`/api/v1/tasks/${created.body.id}`)
      .set(auth)
      .send({ status: 'DONE' })
      .expect(200);
    expect(updated.body.status).toBe('DONE');

    const stats = await api().get('/api/v1/tasks/stats').set(auth).expect(200);
    expect(stats.body).toEqual({ total: 2, byStatus: { TODO: 1, IN_PROGRESS: 0, DONE: 1 } });

    await api().delete(`/api/v1/tasks/${created.body.id}`).set(auth).expect(204);
    const afterDelete = await api().get('/api/v1/tasks').set(auth).expect(200);
    expect(afterDelete.body.meta.total).toBe(1);
  });

  it('assignment fans out an in-app notification via the messaging engine', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');

    const task = await api()
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ title: 'Review PR', assigneeId: bob.id })
      .expect(201);

    // Inline delivery (no Redis in e2e) → the notification row exists already.
    const feed = await api()
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(200);
    expect(feed.body.meta.total).toBe(1);
    expect(feed.body.data[0]).toMatchObject({
      type: 'TASK_ASSIGNED',
      title: 'New task: Review PR',
      payload: { taskId: task.body.id },
      readAt: null,
    });

    // Unread → read flow.
    const unread = await api()
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(200);
    expect(unread.body.unread).toBe(1);

    await api()
      .patch(`/api/v1/notifications/${feed.body.data[0].id}/read`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(200);

    const afterRead = await api()
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(200);
    expect(afterRead.body.unread).toBe(0);

    // Alice cannot read Bob's notification (scoped 404).
    await api()
      .patch(`/api/v1/notifications/${feed.body.data[0].id}/read`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(404);
  });

  it('enforces ownership: strangers get 404, assignees are limited to status', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');
    const eve = await registerUser('eve');

    const task = await api()
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ title: 'Sensitive work', assigneeId: bob.id })
      .expect(201);

    // Eve (no relation) can't see or touch it — 404, not 403 (no id oracle).
    await api()
      .get(`/api/v1/tasks/${task.body.id}`)
      .set('Authorization', `Bearer ${eve.accessToken}`)
      .expect(404);
    await api()
      .delete(`/api/v1/tasks/${task.body.id}`)
      .set('Authorization', `Bearer ${eve.accessToken}`)
      .expect(404);

    // Bob (assignee) may read + update status…
    await api()
      .get(`/api/v1/tasks/${task.body.id}`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(200);
    await api()
      .patch(`/api/v1/tasks/${task.body.id}`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
    // …but not retitle or delete.
    await api()
      .patch(`/api/v1/tasks/${task.body.id}`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ title: 'hijacked' })
      .expect(403);
    await api()
      .delete(`/api/v1/tasks/${task.body.id}`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(403);
  });

  it('validates input: unknown fields rejected, bad uuid rejected, unknown assignee 404', async () => {
    const alice = await registerUser('alice');
    const auth = { Authorization: `Bearer ${alice.accessToken}` };

    await api().post('/api/v1/tasks').set(auth).send({ title: 'x', evil: true }).expect(400);
    await api().get('/api/v1/tasks/not-a-uuid').set(auth).expect(400);
    await api()
      .post('/api/v1/tasks')
      .set(auth)
      .send({ title: 'x', assigneeId: '00000000-0000-4000-8000-000000000000' })
      .expect(404);
  });
});
