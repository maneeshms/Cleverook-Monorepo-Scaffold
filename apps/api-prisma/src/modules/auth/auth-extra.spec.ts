import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';

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
    await controller.register(
      { email: 'a@b.co', password: 'x' } as never,
      {
        headers: { 'user-agent': 'ua', 'x-forwarded-for': '203.0.113.7' },
        ip: '10.0.0.1',
      } as never,
    );
    expect(auth.register).toHaveBeenCalledWith(expect.anything(), {
      userAgent: 'ua',
      ipAddress: '203.0.113.7',
    });

    await controller.login(
      { email: 'a@b.co', password: 'x' } as never,
      {
        headers: {},
        ip: undefined,
      } as never,
    );
    expect(auth.login).toHaveBeenCalledWith(expect.anything(), {
      userAgent: null,
      ipAddress: null,
    });

    await controller.refresh(
      { refreshToken: 'r' } as never,
      {
        headers: { 'cf-connecting-ip': '198.51.100.9' },
        ip: '10.0.0.1',
      } as never,
    );
    expect(auth.refresh).toHaveBeenCalledWith(
      'r',
      expect.objectContaining({ ipAddress: '198.51.100.9' }),
    );

    await controller.logout(current);
    expect(auth.logout).toHaveBeenCalledWith('s1', 'u1');
    await controller.logoutAll(current);
    expect(auth.logoutAll).toHaveBeenCalledWith('u1');
  });
});
