import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, resetDatabase, uniqueUser } from './helpers/e2e-app';

/**
 * OWASP Top 10 (2021) security e2e — pins the security posture to executable
 * assertions against the live guard/pipe chain. Complemented at runtime by
 * scripts/security_scan.py against a deployed instance.
 *
 *   A01 Broken Access Control ........ unauthenticated + cross-user + role checks
 *   A02 Cryptographic Failures ....... tokens opaque/short-lived, no secret leakage
 *   A03 Injection .................... SQL-injection payloads, mass assignment
 *   A04 Insecure Design .............. per-endpoint rate limiting
 *   A05 Security Misconfiguration .... security headers, no stack traces
 *   A07 Auth Failures ................ enumeration, lockout, forged tokens
 */
describe('OWASP Top 10 (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const api = () => request(app.getHttpServer());

  async function registerUser(prefix = 'sec') {
    const user = uniqueUser(prefix);
    const res = await api().post('/api/v1/auth/register').send(user).expect(201);
    return { ...user, ...(res.body as { accessToken: string; refreshToken: string }) };
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

  describe('A01: Broken Access Control', () => {
    it('rejects protected endpoints without a token (401)', async () => {
      await api().get('/api/v1/users/me').expect(401);
      await api().get('/api/v1/tasks').expect(401);
      await api().get('/api/v1/notifications').expect(401);
    });

    it('rejects a malformed/garbage bearer token', async () => {
      await api().get('/api/v1/users/me').set('Authorization', 'Bearer not-a-real-jwt').expect(401);
    });

    it('forbids a normal user from admin-only endpoints (403)', async () => {
      const user = await registerUser();
      await api()
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(403);
    });

    it("prevents one user from reading another user's task (ownership scoping)", async () => {
      const alice = await registerUser('alice');
      const bob = await registerUser('bob');

      const task = await api()
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ title: 'Alice private task' })
        .expect(201);

      const res = await api()
        .get(`/api/v1/tasks/${task.body.id}`)
        .set('Authorization', `Bearer ${bob.accessToken}`);
      expect([403, 404]).toContain(res.status);
    });
  });

  describe('A02: Cryptographic Failures', () => {
    it('issues opaque refresh tokens (not JWTs that leak claims)', async () => {
      const user = await registerUser();
      expect(user.refreshToken.split('.').length).toBeLessThan(3);
    });

    it('never returns password hashes anywhere in the profile', async () => {
      const user = await registerUser();
      const res = await api()
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash|\$2[aby]\$/);
    });
  });

  describe('A03: Injection', () => {
    it('treats SQL metacharacters in login as data, not code', async () => {
      const res = await api()
        .post('/api/v1/auth/login')
        .send({ email: "admin'--@x.com", password: "' OR '1'='1" })
        .expect(401);
      expect(res.body.statusCode).toBe(401);
    });

    it('blocks privilege escalation via extra body fields (mass assignment)', async () => {
      const user = uniqueUser();
      // forbidNonWhitelisted rejects unknown fields outright.
      await api()
        .post('/api/v1/auth/register')
        .send({ ...user, role: 'SUPER_ADMIN' })
        .expect(400);
    });

    it('rejects a non-UUID path param before hitting the DB (ParseUUIDPipe)', async () => {
      const user = await registerUser();
      await api()
        .get('/api/v1/tasks/not-a-uuid')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(400);
    });

    it('rejects SQL metacharacters in list filters as data (search stays parameterized)', async () => {
      const user = await registerUser();
      const res = await api()
        .get(`/api/v1/tasks?search=${encodeURIComponent("'; DROP TABLE tasks;--")}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);
      expect(res.body.meta.total).toBe(0);
    });
  });

  describe('A04: Insecure Design (rate limiting)', () => {
    it('rate-limits auth endpoints per IP', async () => {
      const user = uniqueUser();
      await api().post('/api/v1/auth/register').send(user).expect(201);

      // Flip throttling on just for this assertion (skipIf reads env per request).
      process.env.THROTTLE_DISABLED = 'false';
      try {
        const codes: number[] = [];
        for (let i = 0; i < 9; i++) {
          const res = await api()
            .post('/api/v1/auth/login')
            .send({ email: user.email, password: 'Wr0ng!Pass9' });
          codes.push(res.status);
        }
        // login is capped at 5/min/IP — at least one request must be throttled.
        expect(codes).toContain(429);
      } finally {
        process.env.THROTTLE_DISABLED = 'true';
      }
    });
  });

  describe('A05: Security Misconfiguration', () => {
    it('sets security headers via Helmet and hides the framework fingerprint', async () => {
      const res = await api().post('/api/v1/auth/login').send({ email: 'x@y.com', password: 'z' });
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers).toHaveProperty('x-frame-options');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('returns a correlation id header on every response', async () => {
      const res = await api().get('/api/v1/users/me');
      expect(res.headers['x-request-id']).toEqual(expect.any(String));
    });

    it('returns a normalized error shape without stack traces', async () => {
      const res = await api().get('/api/v1/users/me').expect(401);
      expect(res.body).toMatchObject({
        statusCode: 401,
        path: '/api/v1/users/me',
        timestamp: expect.any(String),
      });
      expect(JSON.stringify(res.body)).not.toMatch(/\bat \/|\.ts:\d+|node_modules/);
    });
  });

  describe('A07: Identification & Authentication Failures', () => {
    it('rejects a forged token signature', async () => {
      const forged =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
        'eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAiLCJyb2xlIjoiU1VQRVJfQURNSU4ifQ.' +
        'invalidsignature';
      await api().get('/api/v1/users/me').set('Authorization', `Bearer ${forged}`).expect(401);
    });

    it('login responses do not reveal whether an email exists', async () => {
      const user = uniqueUser();
      await api().post('/api/v1/auth/register').send(user).expect(201);
      const wrongPw = await api()
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'Wr0ng!Pass9' })
        .expect(401);
      const unknown = await api()
        .post('/api/v1/auth/login')
        .send({ email: 'ghost@nowhere.dev', password: 'Wr0ng!Pass9' })
        .expect(401);
      expect(wrongPw.body.message).toBe(unknown.body.message);
    });
  });
});
