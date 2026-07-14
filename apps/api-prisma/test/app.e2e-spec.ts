import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import helmet from 'helmet';
import { correlationId } from '@clevrook/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('api-prisma (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());

  let counter = 0;
  const uniqueUser = () => ({
    email: `prisma.${Date.now()}.${++counter}@example.com`,
    password: 'Str0ng!Pass1',
    displayName: `Prisma ${counter}`,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(correlationId());
    app.use(helmet());
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.userSession.deleteMany();
    await prisma.user.deleteMany();
  });

  it('health: liveness + readiness (SELECT 1)', async () => {
    const live = await api().get('/api/v1/health').expect(200);
    expect(live.body.status).toBe('ok');
    const ready = await api().get('/api/v1/health/ready').expect(200);
    expect(ready.body.details.database.status).toBe('up');
  });

  it('auth flow: register → me → login → refresh rotation → reuse detection → logout', async () => {
    const user = uniqueUser();

    const reg = await api().post('/api/v1/auth/register').send(user).expect(201);
    expect(reg.body.accessToken).toBeTruthy();

    const me = await api()
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .expect(200);
    expect(me.body.email).toBe(user.email);
    expect(JSON.stringify(me.body)).not.toMatch(/passwordHash|\$2[aby]\$/);

    const login = await api()
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);

    const rotated = await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);
    expect(rotated.body.refreshToken).not.toBe(login.body.refreshToken);

    // Replay of the rotated token → all sessions revoked.
    await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
    await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotated.body.refreshToken })
      .expect(401);
  });

  it('locks the account after 5 failed logins', async () => {
    const user = uniqueUser();
    await api().post('/api/v1/auth/register').send(user).expect(201);
    for (let i = 0; i < 5; i++) {
      await api()
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'Wr0ng!Pass9' })
        .expect(401);
    }
    const locked = await api()
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(401);
    expect(locked.body.message).toMatch(/locked/i);
  });

  it('users: update profile, soft-delete disables the account', async () => {
    const user = uniqueUser();
    const reg = await api().post('/api/v1/auth/register').send(user).expect(201);
    const auth = { Authorization: `Bearer ${reg.body.accessToken}` };

    const renamed = await api()
      .patch('/api/v1/users/me')
      .set(auth)
      .send({ displayName: 'Renamed' })
      .expect(200);
    expect(renamed.body.displayName).toBe('Renamed');

    await api().delete('/api/v1/users/me').set(auth).expect(204);
    // Profile lookups now 404 (soft-deleted), logins fail.
    await api().get('/api/v1/users/me').set(auth).expect(404);
    await api()
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(401);
  });

  it('security posture: guards, validation, headers, error shape', async () => {
    await api().get('/api/v1/users/me').expect(401);
    await api()
      .post('/api/v1/auth/register')
      .send({ ...uniqueUser(), role: 'SUPER_ADMIN' })
      .expect(400); // mass assignment blocked

    const res = await api().post('/api/v1/auth/login').send({ email: 'x@y.co', password: 'z' });
    expect(res.status).toBe(401);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-request-id']).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toMatch(/\bat \/|\.ts:\d+|node_modules/);
  });
});
