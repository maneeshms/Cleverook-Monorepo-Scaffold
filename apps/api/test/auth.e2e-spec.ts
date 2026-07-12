import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, resetDatabase, uniqueUser } from './helpers/e2e-app';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, dataSource } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
  });

  describe('POST /auth/register', () => {
    it('creates an account and returns a token pair', async () => {
      const res = await api().post('/api/v1/auth/register').send(uniqueUser()).expect(201);
      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.refreshToken).toBeTruthy();
      expect(res.body.expiresIn).toBeTruthy();
    });

    it('enforces the password policy', async () => {
      await api()
        .post('/api/v1/auth/register')
        .send({ email: 'weak@example.com', password: 'weakpass' })
        .expect(400);
    });

    it('rejects duplicate emails with 409', async () => {
      const user = uniqueUser();
      await api().post('/api/v1/auth/register').send(user).expect(201);
      await api().post('/api/v1/auth/register').send(user).expect(409);
    });
  });

  describe('POST /auth/login', () => {
    it('authenticates valid credentials', async () => {
      const user = uniqueUser();
      await api().post('/api/v1/auth/register').send(user).expect(201);
      const res = await api()
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(200);
      expect(res.body.accessToken).toBeTruthy();
    });

    it('rejects a wrong password with the same message as unknown users', async () => {
      const user = uniqueUser();
      await api().post('/api/v1/auth/register').send(user).expect(201);
      const wrong = await api()
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'Wr0ng!Pass9' })
        .expect(401);
      const unknown = await api()
        .post('/api/v1/auth/login')
        .send({ email: 'ghost@example.com', password: 'Wr0ng!Pass9' })
        .expect(401);
      expect(wrong.body.message).toBe(unknown.body.message); // no enumeration oracle
    });

    it('locks the account after 5 failed attempts', async () => {
      const user = uniqueUser();
      await api().post('/api/v1/auth/register').send(user).expect(201);
      for (let i = 0; i < 5; i++) {
        await api()
          .post('/api/v1/auth/login')
          .send({ email: user.email, password: 'Wr0ng!Pass9' })
          .expect(401);
      }
      // Even the CORRECT password is rejected while locked.
      const res = await api()
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(401);
      expect(res.body.message).toMatch(/locked/i);
    });
  });

  describe('POST /auth/refresh (rotation + reuse detection)', () => {
    it('rotates the refresh token', async () => {
      const reg = await api().post('/api/v1/auth/register').send(uniqueUser()).expect(201);
      const res = await api()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: reg.body.refreshToken })
        .expect(200);
      expect(res.body.refreshToken).not.toBe(reg.body.refreshToken);
    });

    it('revokes every session when a rotated token is replayed', async () => {
      const reg = await api().post('/api/v1/auth/register').send(uniqueUser()).expect(201);
      const first = await api()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: reg.body.refreshToken })
        .expect(200);

      // Replay of the ORIGINAL (now-rotated) token → theft signal.
      const replay = await api()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: reg.body.refreshToken })
        .expect(401);
      expect(replay.body.message).toMatch(/reuse/i);

      // The legitimate successor token dies with it (blast-radius containment).
      await api()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: first.body.refreshToken })
        .expect(401);
    });

    it('rejects unknown refresh tokens', async () => {
      await api().post('/api/v1/auth/refresh').send({ refreshToken: 'never-issued' }).expect(401);
    });
  });

  describe('logout', () => {
    it('POST /auth/logout revokes the current session', async () => {
      const reg = await api().post('/api/v1/auth/register').send(uniqueUser()).expect(201);
      await api()
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${reg.body.accessToken}`)
        .expect(204);
      await api()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: reg.body.refreshToken })
        .expect(401);
    });

    it('POST /auth/logout-all revokes every session', async () => {
      const user = uniqueUser();
      const s1 = await api().post('/api/v1/auth/register').send(user).expect(201);
      const s2 = await api()
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(200);

      await api()
        .post('/api/v1/auth/logout-all')
        .set('Authorization', `Bearer ${s1.body.accessToken}`)
        .expect(204);

      await api().post('/api/v1/auth/refresh').send({ refreshToken: s1.body.refreshToken }).expect(401);
      await api().post('/api/v1/auth/refresh').send({ refreshToken: s2.body.refreshToken }).expect(401);
    });
  });
});
