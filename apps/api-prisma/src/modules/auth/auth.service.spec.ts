import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuditAction, AuditStatus } from '@clevrook/logger';
import { AuthService } from './auth.service';

describe('AuthService (prisma)', () => {
  let service: AuthService;
  let users: Record<string, jest.Mock>;
  let tokens: Record<string, jest.Mock>;
  let logger: Record<string, jest.Mock>;

  const tokenPair = { accessToken: 'a', refreshToken: 'r', expiresIn: '15m' };
  const makeUser = (overrides: Record<string, unknown> = {}) => ({
    id: 'u1',
    email: 'a@b.co',
    passwordHash: bcrypt.hashSync('Str0ng!Pass', 4),
    failedLoginAttempts: 0,
    lockedUntil: null,
    ...overrides,
  });

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
    logger = { auditAuth: jest.fn(), alertSecurity: jest.fn() };
    service = new AuthService(
      users as never,
      tokens as never,
      { get: () => 4 } as never,
      logger as never,
    );
  });

  it('register hashes the password and audits', async () => {
    const result = await service.register({ email: 'a@b.co', password: 'Str0ng!Pass' });
    expect(result).toBe(tokenPair);
    const created = users.create.mock.calls[0][0];
    expect(created.passwordHash).not.toBe('Str0ng!Pass');
    expect(created.displayName).toBeNull();
    expect(logger.auditAuth).toHaveBeenCalledWith(
      AuditAction.REGISTER,
      AuditStatus.SUCCESS,
      'u1',
      expect.any(Object),
    );
  });

  it('register keeps a provided display name and rejects duplicates', async () => {
    await service.register({ email: 'a@b.co', password: 'Str0ng!Pass', displayName: 'Alex' });
    expect(users.create).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'Alex' }));
    users.findByEmail.mockResolvedValue(makeUser());
    await expect(service.register({ email: 'a@b.co', password: 'Str0ng!Pass' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('login succeeds with valid credentials', async () => {
    users.findByEmail.mockResolvedValue(makeUser());
    await expect(
      service.login({ email: 'a@b.co', password: 'Str0ng!Pass' }, { ipAddress: 'ip' }),
    ).resolves.toBe(tokenPair);
    expect(users.recordSuccessfulLogin).toHaveBeenCalledWith('u1');
  });

  it('login rejects unknown users and SSO-only accounts identically', async () => {
    await expect(service.login({ email: 'x@y.z', password: 'p' })).rejects.toThrow(
      'Invalid credentials',
    );
    users.findByEmail.mockResolvedValue(makeUser({ passwordHash: null }));
    await expect(service.login({ email: 'a@b.co', password: 'p' })).rejects.toThrow(
      'Invalid credentials',
    );
  });

  it('login rejects locked accounts before password comparison', async () => {
    users.findByEmail.mockResolvedValue(makeUser());
    users.isLocked.mockReturnValue(true);
    await expect(service.login({ email: 'a@b.co', password: 'Str0ng!Pass' })).rejects.toThrow(
      /locked/,
    );
    expect(users.recordFailedLogin).not.toHaveBeenCalled();
  });

  it('login counts failures and alerts when the lockout trips', async () => {
    users.findByEmail.mockResolvedValue(makeUser());
    users.isLocked.mockReturnValueOnce(false).mockReturnValueOnce(true);
    await expect(service.login({ email: 'a@b.co', password: 'wrong' })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(users.recordFailedLogin).toHaveBeenCalled();
    expect(logger.alertSecurity).toHaveBeenCalled();
  });

  it('login failure below the lockout threshold does not alert', async () => {
    users.findByEmail.mockResolvedValue(makeUser());
    await expect(service.login({ email: 'a@b.co', password: 'wrong' })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(logger.alertSecurity).not.toHaveBeenCalled();
  });

  it('refresh/logout/logoutAll delegate to the token service', async () => {
    await service.refresh('tok');
    expect(tokens.refreshSession).toHaveBeenCalledWith('tok', {});
    await service.logout('s1', 'u1');
    expect(tokens.revokeSession).toHaveBeenCalledWith('s1');
    await service.logoutAll('u1');
    expect(tokens.revokeAllForUser).toHaveBeenCalledWith('u1');
    expect(logger.auditAuth).toHaveBeenCalledWith(AuditAction.LOGOUT, AuditStatus.SUCCESS, 'u1');
    expect(logger.auditAuth).toHaveBeenCalledWith(
      AuditAction.LOGOUT_ALL,
      AuditStatus.SUCCESS,
      'u1',
    );
  });
});
