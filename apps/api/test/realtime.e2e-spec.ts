import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AddressInfo } from 'node:net';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { createTestApp, resetDatabase, uniqueUser } from './helpers/e2e-app';

/**
 * Realtime channel (socket.io) e2e: boots the REAL app on a live port and
 * proves the whole chain — REST login → JWT socket handshake → task assignment
 * → messaging IN_APP sink → live `notification` event on the assignee's socket.
 */
describe('Realtime notifications (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let baseUrl: string;
  const sockets: Socket[] = [];
  const api = () => request(app.getHttpServer());

  async function registerUser(prefix = 'rt') {
    const user = uniqueUser(prefix);
    const res = await api().post('/api/v1/auth/register').send(user).expect(201);
    const me = await api()
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
    return { ...user, ...res.body, id: me.body.id as string };
  }

  function connect(auth?: Record<string, string>): Socket {
    const socket = io(baseUrl, { auth, transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    return socket;
  }

  const once = <T>(socket: Socket, event: string): Promise<T> =>
    new Promise((resolve) => socket.once(event, resolve));

  beforeAll(async () => {
    ({ app, dataSource } = await createTestApp());
    // Sockets need a real listening server (supertest's ephemeral one has no ws).
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(() => {
    while (sockets.length) sockets.pop()?.disconnect();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
  });

  it('refuses a connection without a token', async () => {
    const err = await once<Error>(connect(), 'connect_error');
    expect(err.message).toBe('unauthorized');
  });

  it('refuses a connection with a garbage token', async () => {
    const err = await once<Error>(connect({ token: 'not-a-jwt' }), 'connect_error');
    expect(err.message).toBe('unauthorized');
  });

  it('accepts a valid access token', async () => {
    const user = await registerUser();
    const socket = connect({ token: user.accessToken });
    await once(socket, 'connect');
    expect(socket.connected).toBe(true);
  });

  it('delivers a live notification to the assignee when a task is assigned', async () => {
    const owner = await registerUser('owner');
    const assignee = await registerUser('assignee');

    const socket = connect({ token: assignee.accessToken });
    await once(socket, 'connect');
    const received = once<{ id: string; type: string; title: string }>(socket, 'notification');

    await api()
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Ship realtime', assigneeId: assignee.id })
      .expect(201);

    const event = await received;
    expect(event.type).toBe('TASK_ASSIGNED');
    expect(event.title).toContain('Ship realtime');
    expect(event.id).toBeDefined();

    // The socket event mirrors the durable in-app feed row, not replaces it.
    const feed = await api()
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${assignee.accessToken}`)
      .expect(200);
    expect(feed.body.data[0].id).toBe(event.id);
  });

  it('does NOT leak notifications to other users (room isolation)', async () => {
    const owner = await registerUser('owner');
    const assignee = await registerUser('assignee');
    const bystander = await registerUser('bystander');

    const spy = jest.fn();
    const bystanderSocket = connect({ token: bystander.accessToken });
    await once(bystanderSocket, 'connect');
    bystanderSocket.on('notification', spy);

    const assigneeSocket = connect({ token: assignee.accessToken });
    await once(assigneeSocket, 'connect');
    const received = once(assigneeSocket, 'notification');

    await api()
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Private task', assigneeId: assignee.id })
      .expect(201);

    await received; // assignee got theirs…
    expect(spy).not.toHaveBeenCalled(); // …the bystander saw nothing
  });
});
