import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { HealthController } from '../health/health.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AuthController } from './auth/auth.controller';
import { JwtStrategy } from './auth/jwt.strategy';
import { UsersController } from './users/users.controller';

describe('HealthController (prisma)', () => {
  it('liveness answers without dependencies', () => {
    const controller = new HealthController({} as never);
    expect(controller.liveness().status).toBe('ok');
  });

  it('readiness reports database up/down', async () => {
    const up = new HealthController({ $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]) } as never);
    await expect(up.readiness()).resolves.toMatchObject({
      details: { database: { status: 'up' } },
    });
    const down = new HealthController({
      $queryRaw: jest.fn().mockRejectedValue(new Error('conn refused')),
    } as never);
    await expect(down.readiness()).rejects.toThrow(ServiceUnavailableException);
  });
});

describe('PrismaService', () => {
  it('refuses to construct without a connection URL', () => {
    expect(() => new PrismaService({ get: () => undefined } as never)).toThrow(
      /PRISMA_DATABASE_URL/,
    );
  });

  it('connects on init and disconnects on destroy', async () => {
    const service = new PrismaService({
      get: () => 'postgresql://postgres:postgres@localhost:5432/x',
    } as never);
    const connect = jest.spyOn(service, '$connect').mockResolvedValue();
    const disconnect = jest.spyOn(service, '$disconnect').mockResolvedValue();
    await service.onModuleInit();
    await service.onModuleDestroy();
    expect(connect).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
  });
});

describe('JwtStrategy (prisma)', () => {
  const strategy = new JwtStrategy({ get: () => 's'.repeat(40) } as never);

  it('passes valid payloads and rejects malformed ones', () => {
    const payload = { sub: 'u1', email: 'a@b.co', role: 'USER', sessionId: 's1' };
    expect(strategy.validate(payload)).toBe(payload);
    expect(() => strategy.validate({} as never)).toThrow(UnauthorizedException);
  });
});

describe('AuthController (prisma)', () => {
  const auth = {
    register: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    logoutAll: jest.fn(),
  };
  const controller = new AuthController(auth as never);
  const current = { sub: 'u1', email: 'a@b.co', role: 'USER', sessionId: 's1' };

  it('extracts the request context and scopes session ops', async () => {
    await controller.register({ email: 'a@b.co', password: 'x' } as never, {
      headers: { 'user-agent': 'ua', 'x-forwarded-for': '203.0.113.7' },
      ip: '10.0.0.1',
    } as never);
    expect(auth.register).toHaveBeenCalledWith(expect.anything(), {
      userAgent: 'ua',
      ipAddress: '203.0.113.7',
    });

    await controller.login({ email: 'a@b.co', password: 'x' } as never, {
      headers: {},
      ip: undefined,
    } as never);
    expect(auth.login).toHaveBeenCalledWith(expect.anything(), {
      userAgent: null,
      ipAddress: null,
    });

    await controller.refresh({ refreshToken: 'r' } as never, {
      headers: { 'cf-connecting-ip': '198.51.100.9' },
      ip: '10.0.0.1',
    } as never);
    expect(auth.refresh).toHaveBeenCalledWith('r', expect.objectContaining({ ipAddress: '198.51.100.9' }));

    await controller.logout(current);
    expect(auth.logout).toHaveBeenCalledWith('s1', 'u1');
    await controller.logoutAll(current);
    expect(auth.logoutAll).toHaveBeenCalledWith('u1');
  });
});

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
