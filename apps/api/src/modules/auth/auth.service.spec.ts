import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuditAction, AuditStatus } from '@clevscaffold/logger';
// clevscaffold:messaging:start
import { MessageType } from '@clevscaffold/messaging';
// clevscaffold:messaging:end
import { AuthService } from './auth.service';
import { User } from '../users/entities/user.entity';

describe('AuthService', () => {
  let service: AuthService;
  let users: {
    findByEmail: jest.Mock;
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
  // clevscaffold:messaging:start
  let messaging: { dispatch: jest.Mock };
  // clevscaffold:messaging:end

  const tokenPair = { accessToken: 'a', refreshToken: 'r', expiresIn: '15m' };

  const makeUser = (overrides: Partial<User> = {}): User =>
    ({
      id: 'u1',
      email: 'a@b.co',
      displayName: 'Alex',
      passwordHash: bcrypt.hashSync('Str0ng!Pass', 4),
      failedLoginAttempts: 0,
      lockedUntil: null,
      ...overrides,
    }) as User;

  beforeEach(() => {
    users = {
      findByEmail: jest.fn().mockResolvedValue(null),
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
    // clevscaffold:messaging:start
    messaging = { dispatch: jest.fn().mockResolvedValue(undefined) };
    // clevscaffold:messaging:end
    const config = {
      get: (key: string) => ({ 'app.bcryptRounds': 4 })[key],
    };
    service = new AuthService(
      users as never,
      tokens as never,
      config as never,
      logger as never,
      // clevscaffold:messaging:start
      messaging as never,
      // clevscaffold:messaging:end
    );
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

    // clevscaffold:messaging:start
    // Welcome-email behaviour lives in its own block so init.mjs can strip it
    // wholesale when the messaging capability is not selected.
    describe('welcome email (messaging)', () => {
      it('dispatches a WELCOME message on register', async () => {
        await service.register(dto);
        expect(messaging.dispatch).toHaveBeenCalledWith(
          expect.objectContaining({
            messageType: MessageType.WELCOME,
            recipient: { email: 'a@b.co' },
          }),
        );
      });

      it('passes bare-greeting variables when there is no display name', async () => {
        await service.register({ email: 'a@b.co', password: 'Str0ng!Pass' });
        expect(messaging.dispatch).toHaveBeenCalledWith(
          expect.objectContaining({
            variables: expect.objectContaining({ displayName: '', displayNameComma: '!' }),
          }),
        );
      });

      it('never fails signup because the welcome email failed', async () => {
        messaging.dispatch.mockRejectedValue(new Error('provider down'));
        await expect(service.register(dto)).resolves.toBe(tokenPair);
        // flush the microtask queue so the .catch handler runs
        await new Promise(process.nextTick);
        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('Welcome email dispatch failed'),
          undefined,
          'Auth',
        );
      });
    });
    // clevscaffold:messaging:end
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

    it('counts failed attempts on a bad password', async () => {
      users.findByEmail.mockResolvedValue(makeUser());
      await expect(service.login({ ...dto, password: 'wrong' })).rejects.toThrow(
        UnauthorizedException,
      );
      expect(users.recordFailedLogin).toHaveBeenCalled();
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
