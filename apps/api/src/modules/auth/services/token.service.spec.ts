import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { TokenService } from './token.service';
import { User } from '../../users/entities/user.entity';
import { UserSession } from '../entities/user-session.entity';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('TokenService', () => {
  let service: TokenService;
  let sessions: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let logger: { alertSecurity: jest.Mock };

  const user = { id: 'u1', email: 'a@b.co', role: 'USER' } as User;
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
    sessions = {
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => ({ id: 'sess-1', ...row })),
      findOne: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    logger = { alertSecurity: jest.fn() };
    service = new TokenService(jwt, config as never, sessions as never, logger as never);
  });

  describe('issueForNewSession', () => {
    it('stores only the SHA-256 of the refresh token', async () => {
      const pair = await service.issueForNewSession(user, {
        ipAddress: '1.1.1.1',
        userAgent: 'ua',
      });
      const stored = sessions.save.mock.calls[0][0];
      expect(stored.refreshTokenHash).toBe(sha256(pair.refreshToken));
      expect(stored.refreshTokenHash).not.toBe(pair.refreshToken);
      expect(stored.ipAddress).toBe('1.1.1.1');
      expect(pair.expiresIn).toBe('15m');
    });

    it('signs an access token with the trimmed payload', async () => {
      const pair = await service.issueForNewSession(user);
      const payload = jwt.decode(pair.accessToken) as Record<string, unknown>;
      expect(payload).toEqual(
        expect.objectContaining({ sub: 'u1', email: 'a@b.co', role: 'USER', sessionId: 'sess-1' }),
      );
      expect(payload.tier).toBeUndefined();
    });
  });

  describe('refreshSession', () => {
    const activeSession = (overrides: Partial<UserSession> = {}): UserSession =>
      ({
        id: 'sess-1',
        userId: 'u1',
        user,
        refreshTokenHash: 'hash',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86_400_000),
        userAgent: 'old-ua',
        ipAddress: 'old-ip',
        ...overrides,
      }) as UserSession;

    it('rejects unknown tokens', async () => {
      sessions.findOne.mockResolvedValue(null);
      await expect(service.refreshSession('nope')).rejects.toThrow('Invalid refresh token');
    });

    it('detects reuse of a rotated token and revokes every session', async () => {
      sessions.findOne.mockResolvedValue(activeSession({ revokedAt: new Date() }));
      await expect(service.refreshSession('stolen')).rejects.toThrow(/reuse detected/);
      // revoke-all goes through update with the userId criteria
      expect(sessions.update).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1' }),
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
      expect(logger.alertSecurity).toHaveBeenCalledWith(
        expect.stringContaining('reuse'),
        expect.anything(),
        expect.objectContaining({ userId: 'u1' }),
      );
    });

    it('revokes and rejects expired sessions', async () => {
      sessions.findOne.mockResolvedValue(activeSession({ expiresAt: new Date(Date.now() - 1000) }));
      await expect(service.refreshSession('old')).rejects.toThrow('Session expired');
      expect(sessions.update).toHaveBeenCalledWith('sess-1', { revokedAt: expect.any(Date) });
    });

    it('rotates: revokes the presented session and chains a new one', async () => {
      sessions.findOne.mockResolvedValue(activeSession());
      const pair = await service.refreshSession('valid-token', { ipAddress: 'new-ip' });
      expect(sessions.update).toHaveBeenCalledWith('sess-1', { revokedAt: expect.any(Date) });
      const newRow = sessions.save.mock.calls[0][0];
      expect(newRow.refreshTokenHash).toBe(sha256(pair.refreshToken));
      expect(newRow.ipAddress).toBe('new-ip'); // fresh ctx wins
      expect(newRow.userAgent).toBe('old-ua'); // falls back to prior session
      expect(pair.accessToken).toBeTruthy();
    });
  });

  it('applies safe defaults when config TTLs are unset and ctx is omitted', async () => {
    const bareConfig = { get: (key: string) => ({ 'jwt.accessSecret': 's'.repeat(40) })[key] };
    const bare = new TokenService(jwt, bareConfig as never, sessions as never, logger as never);
    const pair = await bare.issueForNewSession(user);
    expect(pair.expiresIn).toBe('15m'); // ?? default
    const stored = sessions.save.mock.calls[0][0];
    expect(stored.userAgent).toBeNull();
    expect(stored.ipAddress).toBeNull();
    // ~30 days by default
    const days = (stored.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(30);
  });

  it('tolerates a malformed refresh TTL (falls back to 30d)', async () => {
    const oddConfig = {
      get: (key: string) =>
        ({ 'jwt.accessSecret': 's'.repeat(40), 'jwt.refreshTtl': 'not-a-ttl' })[key],
    };
    const odd = new TokenService(jwt, oddConfig as never, sessions as never, logger as never);
    await odd.issueForNewSession(user);
    const stored = sessions.save.mock.calls[0][0];
    const days = (stored.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(30);
  });

  it('rotation without a fresh ctx keeps the prior session fingerprint', async () => {
    sessions.findOne.mockResolvedValue({
      id: 'sess-1',
      userId: 'u1',
      user,
      refreshTokenHash: 'hash',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      userAgent: 'old-ua',
      ipAddress: 'old-ip',
    } as UserSession);
    await service.refreshSession('valid');
    const newRow = sessions.save.mock.calls[0][0];
    expect(newRow.ipAddress).toBe('old-ip');
    expect(newRow.userAgent).toBe('old-ua');
  });

  it('revokeSession stamps revoked_at', async () => {
    await service.revokeSession('sess-9');
    expect(sessions.update).toHaveBeenCalledWith('sess-9', { revokedAt: expect.any(Date) });
  });

  it('purgeExpired deletes stale rows', async () => {
    await service.purgeExpired();
    expect(sessions.delete).toHaveBeenCalled();
  });
});
