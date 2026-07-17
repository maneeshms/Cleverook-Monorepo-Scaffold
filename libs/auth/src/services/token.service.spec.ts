import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { TokenService } from './token.service';
import { UserSession } from '../entities/user-session.entity';
import { AuthUserRecord } from '../interfaces/auth-user-store.interface';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('TokenService', () => {
  let service: TokenService;
  let sessions: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let users: { findById: jest.Mock };
  let logger: { alertSecurity: jest.Mock };

  const user = {
    id: 'u1',
    email: 'a@b.co',
    role: 'USER',
    failedLoginAttempts: 0,
  } as AuthUserRecord;
  const jwt = new JwtService({});
  const options = { accessSecret: 's'.repeat(40), accessTtl: '15m', refreshTtl: '30d' };

  const makeService = (opts = options) => {
    return new TokenService(jwt, opts as never, sessions as never, users as never, logger as never);
  };

  beforeEach(() => {
    sessions = {
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => ({ id: 'sess-1', ...row })),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      delete: jest.fn(),
    };
    users = { findById: jest.fn().mockResolvedValue(user) };
    logger = { alertSecurity: jest.fn() };
    service = makeService();
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

  it('a subclass can add custom claims via buildAccessPayload', async () => {
    class TenantTokenService extends TokenService {
      protected override buildAccessPayload(u: AuthUserRecord, sessionId: string) {
        return { ...super.buildAccessPayload(u, sessionId), tenant: 'acme' };
      }
    }
    const custom = new TenantTokenService(
      jwt,
      options as never,
      sessions as never,
      users as never,
      logger as never,
    );
    const pair = await custom.issueForNewSession(user);
    const payload = jwt.decode(pair.accessToken) as Record<string, unknown>;
    expect(payload.tenant).toBe('acme');
    expect(payload.sub).toBe('u1'); // base claims preserved
  });

  describe('refreshSession', () => {
    const activeSession = (overrides: Partial<UserSession> = {}): UserSession =>
      ({
        id: 'sess-1',
        userId: 'u1',
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

    it('revokes and rejects when the user behind the session no longer exists', async () => {
      sessions.findOne.mockResolvedValue(activeSession());
      users.findById.mockResolvedValue(null);
      await expect(service.refreshSession('orphan')).rejects.toThrow('Invalid refresh token');
      expect(sessions.update).toHaveBeenCalledWith('sess-1', { revokedAt: expect.any(Date) });
      expect(sessions.save).not.toHaveBeenCalled();
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
      // the fresh access token is signed for the store-resolved user
      expect(users.findById).toHaveBeenCalledWith('u1');
    });

    it('rotation without a fresh ctx keeps the prior session fingerprint', async () => {
      sessions.findOne.mockResolvedValue(activeSession());
      await service.refreshSession('valid');
      const newRow = sessions.save.mock.calls[0][0];
      expect(newRow.ipAddress).toBe('old-ip');
      expect(newRow.userAgent).toBe('old-ua');
    });
  });

  it('applies safe defaults when TTL options are unset and ctx is omitted', async () => {
    const bare = makeService({ accessSecret: 's'.repeat(40) } as never);
    const pair = await bare.issueForNewSession(user);
    expect(pair.expiresIn).toBe('15m'); // default
    const stored = sessions.save.mock.calls[0][0];
    expect(stored.userAgent).toBeNull();
    expect(stored.ipAddress).toBeNull();
    // ~30 days by default
    const days = (stored.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(30);
  });

  it('tolerates a malformed refresh TTL (falls back to 30d)', async () => {
    const odd = makeService({ accessSecret: 's'.repeat(40), refreshTtl: 'not-a-ttl' } as never);
    await odd.issueForNewSession(user);
    const stored = sessions.save.mock.calls[0][0];
    const days = (stored.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(30);
  });

  it('revokeSession stamps revoked_at', async () => {
    await service.revokeSession('sess-9');
    expect(sessions.update).toHaveBeenCalledWith('sess-9', { revokedAt: expect.any(Date) });
  });

  it('listSessionsForUser returns rows newest-first for GDPR export/device views', async () => {
    sessions.find.mockResolvedValue([{ id: 's2' }, { id: 's1' }]);
    await expect(service.listSessionsForUser('u1')).resolves.toHaveLength(2);
    expect(sessions.find).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      order: { createdAt: 'DESC' },
    });
  });

  it('purgeExpired deletes stale rows', async () => {
    await service.purgeExpired();
    expect(sessions.delete).toHaveBeenCalled();
  });
});
