import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuditAction, AuditStatus } from '@clevrook/logger';
import { AuthService, RequestContext } from './auth.service';
import { AuthUserRecord } from '../interfaces/auth-user-store.interface';

describe('AuthService (base)', () => {
  let users: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    isLocked: jest.Mock;
    recordFailedLogin: jest.Mock;
    recordSuccessfulLogin: jest.Mock;
  };
  let tokens: {
    issueForNewSession: jest.Mock;
    refreshSession: jest.Mock;
    revokeSession: jest.Mock;
    revokeAllForUser: jest.Mock;
  };
  let logger: { auditAuth: jest.Mock; alertSecurity: jest.Mock; error: jest.Mock };
  let service: AuthService;

  const tokenPair = { accessToken: 'a', refreshToken: 'r', expiresIn: '15m' };
  const options = { accessSecret: 's'.repeat(40), bcryptRounds: 4, maxLoginAttempts: 5 };

  const makeUser = (overrides: Partial<AuthUserRecord> = {}): AuthUserRecord =>
    ({
      id: 'u1',
      email: 'a@b.co',
      displayName: 'Alex',
      role: 'USER',
      passwordHash: bcrypt.hashSync('Str0ng!Pass', 4),
      failedLoginAttempts: 0,
      lockedUntil: null,
      ...overrides,
    }) as AuthUserRecord;

  const construct = (Cls: typeof AuthService = AuthService) =>
    new Cls(users as never, tokens as never, options as never, logger as never);

  beforeEach(() => {
    users = {
      findByEmail: jest.fn().mockResolvedValue(null),
      findById: jest.fn(),
      create: jest.fn().mockImplementation(async (data) => makeUser(data)),
      isLocked: jest.fn().mockReturnValue(false),
      recordFailedLogin: jest.fn(),
      recordSuccessfulLogin: jest.fn(),
    };
    tokens = {
      issueForNewSession: jest.fn().mockResolvedValue(tokenPair),
      refreshSession: jest.fn().mockResolvedValue(tokenPair),
      revokeSession: jest.fn(),
      revokeAllForUser: jest.fn(),
    };
    logger = { auditAuth: jest.fn(), alertSecurity: jest.fn(), error: jest.fn() };
    service = construct();
  });

  describe('register', () => {
    const dto = { email: 'a@b.co', password: 'Str0ng!Pass', displayName: 'Alex' };

    it('hashes the password, audits, and returns tokens', async () => {
      const result = await service.register(dto, { ipAddress: '1.2.3.4' });
      expect(result).toBe(tokenPair);
      const created = users.create.mock.calls[0][0];
      expect(created.passwordHash).not.toBe(dto.password);
      expect(await bcrypt.compare(dto.password, created.passwordHash)).toBe(true);
      expect(logger.auditAuth).toHaveBeenCalledWith(
        AuditAction.REGISTER,
        AuditStatus.SUCCESS,
        'u1',
        expect.objectContaining({ ipAddress: '1.2.3.4' }),
      );
    });

    it('registers without a display name (defaults)', async () => {
      await service.register({ email: 'a@b.co', password: 'Str0ng!Pass' });
      expect(users.create).toHaveBeenCalledWith(expect.objectContaining({ displayName: null }));
    });

    it('rejects duplicate emails with 409', async () => {
      users.findByEmail.mockResolvedValue(makeUser());
      await expect(service.register(dto)).rejects.toThrow(ConflictException);
      expect(users.create).not.toHaveBeenCalled();
    });
  });

  describe('extension hooks (the subclass contract)', () => {
    const dto = { email: 'a@b.co', password: 'Str0ng!Pass' };

    it('onRegistered receives the created user and the request context', async () => {
      const seen: unknown[] = [];
      class Extended extends AuthService {
        protected override async onRegistered(u: AuthUserRecord, ctx: RequestContext) {
          seen.push([u.id, ctx.ipAddress]);
        }
      }
      await construct(Extended as never).register(dto, { ipAddress: '4.4.4.4' });
      expect(seen).toEqual([['u1', '4.4.4.4']]);
    });

    it('a throwing onRegistered never fails the signup — logged instead', async () => {
      class Broken extends AuthService {
        protected override async onRegistered() {
          throw new Error('side effect down');
        }
      }
      await expect(construct(Broken as never).register(dto)).resolves.toBe(tokenPair);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('onRegistered hook failed'),
        undefined,
        'Auth',
      );
    });

    it('onLoggedIn fires after a successful login, never on failure', async () => {
      const calls: string[] = [];
      class Extended extends AuthService {
        protected override async onLoggedIn(u: AuthUserRecord) {
          calls.push(u.id);
        }
      }
      const extended = construct(Extended as never);
      users.findByEmail.mockResolvedValue(makeUser());
      await extended.login({ email: 'a@b.co', password: 'Str0ng!Pass' });
      expect(calls).toEqual(['u1']);

      await expect(extended.login({ email: 'a@b.co', password: 'wrong' })).rejects.toThrow(
        UnauthorizedException,
      );
      expect(calls).toEqual(['u1']); // unchanged
    });

    it('a throwing onLoggedIn never fails the login — logged instead', async () => {
      class Broken extends AuthService {
        protected override async onLoggedIn() {
          throw new Error('analytics down');
        }
      }
      users.findByEmail.mockResolvedValue(makeUser());
      await expect(
        construct(Broken as never).login({ email: 'a@b.co', password: 'Str0ng!Pass' }),
      ).resolves.toBe(tokenPair);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('onLoggedIn hook failed'),
        undefined,
        'Auth',
      );
    });
  });

  describe('login', () => {
    const dto = { email: 'a@b.co', password: 'Str0ng!Pass' };

    it('returns tokens and resets counters on valid credentials', async () => {
      users.findByEmail.mockResolvedValue(makeUser());
      const result = await service.login(dto, { ipAddress: '9.9.9.9' });
      expect(result).toBe(tokenPair);
      expect(users.recordSuccessfulLogin).toHaveBeenCalledWith('u1');
      expect(logger.auditAuth).toHaveBeenCalledWith(
        AuditAction.LOGIN,
        AuditStatus.SUCCESS,
        'u1',
        expect.any(Object),
      );
    });

    it('rejects unknown users with the same error and audit trail', async () => {
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
      expect(logger.auditAuth).toHaveBeenCalledWith(
        AuditAction.LOGIN,
        AuditStatus.FAILURE,
        undefined,
        expect.objectContaining({ reason: 'unknown_user' }),
      );
    });

    it('rejects users without a password hash (e.g. SSO-only accounts)', async () => {
      users.findByEmail.mockResolvedValue(makeUser({ passwordHash: null }));
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects locked accounts before comparing passwords', async () => {
      users.findByEmail.mockResolvedValue(makeUser());
      users.isLocked.mockReturnValue(true);
      await expect(service.login(dto)).rejects.toThrow(/locked/);
      expect(users.recordFailedLogin).not.toHaveBeenCalled();
    });

    it('counts failed attempts with the configured threshold on a bad password', async () => {
      users.findByEmail.mockResolvedValue(makeUser());
      await expect(service.login({ ...dto, password: 'wrong' })).rejects.toThrow(
        UnauthorizedException,
      );
      expect(users.recordFailedLogin).toHaveBeenCalledWith(expect.anything(), 5);
      expect(logger.alertSecurity).not.toHaveBeenCalled();
    });

    it('raises a security alert when the failure trips the lockout', async () => {
      users.findByEmail.mockResolvedValue(makeUser());
      users.isLocked.mockReturnValueOnce(false).mockReturnValueOnce(true);
      await expect(service.login({ ...dto, password: 'wrong' })).rejects.toThrow(
        UnauthorizedException,
      );
      expect(logger.alertSecurity).toHaveBeenCalledWith(
        expect.stringContaining('locked'),
        expect.anything(),
        expect.objectContaining({ userId: 'u1' }),
      );
    });
  });

  it('refresh delegates to the token service', async () => {
    await expect(service.refresh('tok', { ipAddress: 'ip' })).resolves.toBe(tokenPair);
    expect(tokens.refreshSession).toHaveBeenCalledWith('tok', { ipAddress: 'ip' });
  });

  it('logout revokes the session and audits', async () => {
    await service.logout('s1', 'u1');
    expect(tokens.revokeSession).toHaveBeenCalledWith('s1');
    expect(logger.auditAuth).toHaveBeenCalledWith(AuditAction.LOGOUT, AuditStatus.SUCCESS, 'u1');
  });

  it('logoutAll revokes every session and audits', async () => {
    await service.logoutAll('u1');
    expect(tokens.revokeAllForUser).toHaveBeenCalledWith('u1');
    expect(logger.auditAuth).toHaveBeenCalledWith(
      AuditAction.LOGOUT_ALL,
      AuditStatus.SUCCESS,
      'u1',
    );
  });
});
