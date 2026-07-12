import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const auth = {
    register: jest.fn().mockResolvedValue('pair'),
    login: jest.fn().mockResolvedValue('pair'),
    refresh: jest.fn().mockResolvedValue('pair'),
    logout: jest.fn(),
    logoutAll: jest.fn(),
  };
  const controller = new AuthController(auth as never);
  const currentUser = { sub: 'u1', email: 'a@b.co', role: 'USER', sessionId: 's1' };

  const req = (headers: Record<string, string> = {}, ip = '10.0.0.1') =>
    ({ headers, ip }) as never;

  it('register/login/refresh pass a request context extracted from headers', async () => {
    await controller.register({ email: 'a@b.co', password: 'x' } as never, req({ 'user-agent': 'ua' }));
    expect(auth.register).toHaveBeenCalledWith(expect.anything(), {
      userAgent: 'ua',
      ipAddress: '10.0.0.1',
    });

    await controller.login({ email: 'a@b.co', password: 'x' } as never, req({
      'x-forwarded-for': '203.0.113.7, 10.0.0.1',
    }));
    expect(auth.login).toHaveBeenCalledWith(expect.anything(), {
      userAgent: null,
      ipAddress: '203.0.113.7',
    });

    await controller.refresh({ refreshToken: 'r' } as never, req({
      'cf-connecting-ip': '198.51.100.9',
    }));
    expect(auth.refresh).toHaveBeenCalledWith('r', {
      userAgent: null,
      ipAddress: '198.51.100.9',
    });
  });

  it('falls back through the ip chain to null', async () => {
    await controller.login({ email: 'a@b.co', password: 'x' } as never, {
      headers: {},
      ip: undefined,
    } as never);
    expect(auth.login).toHaveBeenLastCalledWith(expect.anything(), {
      userAgent: null,
      ipAddress: null,
    });
  });

  it('logout targets the current session; logout-all the whole user', async () => {
    await controller.logout(currentUser);
    expect(auth.logout).toHaveBeenCalledWith('s1', 'u1');
    await controller.logoutAll(currentUser);
    expect(auth.logoutAll).toHaveBeenCalledWith('u1');
  });
});
