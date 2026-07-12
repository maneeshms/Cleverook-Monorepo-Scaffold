import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { TokenService } from './token.service';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('TokenService (prisma)', () => {
  let service: TokenService;
  let sessionModel: Record<string, jest.Mock>;
  let logger: { alertSecurity: jest.Mock };

  const user = { id: 'u1', email: 'a@b.co', role: 'USER' } as never;
  const jwt = new JwtService({});
  const config = {
    get: (key: string) =>
      ({
        'jwt.accessSecret': 's'.repeat(40),
        'jwt.accessTtl': '15m',
        'jwt.refreshTtl': '30d',
      })[key],
  };

  beforeEach(() => {
    sessionModel = {
      create: jest.fn(async ({ data }) => ({ id: 'sess-1', ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      updateMany: jest.fn(),
    };
    logger = { alertSecurity: jest.fn() };
    service = new TokenService(
      jwt,
      config as never,
      { userSession: sessionModel } as never,
      logger as never,
    );
  });

  const activeSession = (overrides: Record<string, unknown> = {}) => ({
    id: 'sess-1',
    userId: 'u1',
    user,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    userAgent: 'old-ua',
    ipAddress: 'old-ip',
    ...overrides,
  });

  it('issues a pair, storing only the token hash', async () => {
    const pair = await service.issueForNewSession(user, { ipAddress: '1.1.1.1' });
    const stored = sessionModel.create.mock.calls[0][0].data;
    expect(stored.refreshTokenHash).toBe(sha256(pair.refreshToken));
    expect(stored.userAgent).toBeNull();
    const payload = jwt.decode(pair.accessToken) as Record<string, unknown>;
    expect(payload).toEqual(
      expect.objectContaining({ sub: 'u1', role: 'USER', sessionId: 'sess-1' }),
    );
  });

  it('rejects unknown refresh tokens', async () => {
    await expect(service.refreshSession('nope')).rejects.toThrow('Invalid refresh token');
  });

  it('revokes everything on reuse of a rotated token', async () => {
    sessionModel.findFirst.mockResolvedValue(activeSession({ revokedAt: new Date() }));
    await expect(service.refreshSession('stolen')).rejects.toThrow(/reuse detected/);
    expect(sessionModel.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(logger.alertSecurity).toHaveBeenCalled();
  });

  it('revokes and rejects expired sessions', async () => {
    sessionModel.findFirst.mockResolvedValue(
      activeSession({ expiresAt: new Date(Date.now() - 1000) }),
    );
    await expect(service.refreshSession('old')).rejects.toThrow('Session expired');
    expect(sessionModel.update).toHaveBeenCalledWith({
      where: { id: 'sess-1' },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('rotates: revokes the presented session, chains a new one, inherits fingerprint', async () => {
    sessionModel.findFirst.mockResolvedValue(activeSession());
    const pair = await service.refreshSession('valid', { ipAddress: 'new-ip' });
    expect(sessionModel.update).toHaveBeenCalledWith({
      where: { id: 'sess-1' },
      data: { revokedAt: expect.any(Date) },
    });
    const newRow = sessionModel.create.mock.calls[0][0].data;
    expect(newRow.refreshTokenHash).toBe(sha256(pair.refreshToken));
    expect(newRow.ipAddress).toBe('new-ip');
    expect(newRow.userAgent).toBe('old-ua');
  });

  it('handles unset TTL config with safe defaults', async () => {
    const bare = new TokenService(
      jwt,
      { get: (k: string) => ({ 'jwt.accessSecret': 's'.repeat(40) })[k] } as never,
      { userSession: sessionModel } as never,
      logger as never,
    );
    const pair = await bare.issueForNewSession(user);
    expect(pair.expiresIn).toBe('15m');
    const stored = sessionModel.create.mock.calls[0][0].data;
    const days = (stored.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(30);
  });

  it('revokeSession stamps a single row', async () => {
    await service.revokeSession('sess-7');
    expect(sessionModel.update).toHaveBeenCalledWith({
      where: { id: 'sess-7' },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
