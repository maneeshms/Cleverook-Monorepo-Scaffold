import * as bcrypt from 'bcryptjs';
// clevscaffold:messaging:start
import { MessageType } from '@clevrook/messaging';
// clevscaffold:messaging:end
import { AppAuthService } from './app-auth.service';

/**
 * The base flows (register/login/refresh/lockout/reuse detection) are covered in
 * libs/auth. This spec covers what THIS app adds on top via the hook contract.
 */
describe('AppAuthService', () => {
  let users: { findByEmail: jest.Mock; create: jest.Mock };
  let tokens: { issueForNewSession: jest.Mock };
  let logger: { auditAuth: jest.Mock; error: jest.Mock };
  // clevscaffold:messaging:start
  let messaging: { dispatch: jest.Mock };
  // clevscaffold:messaging:end
  let service: AppAuthService;

  const tokenPair = { accessToken: 'a', refreshToken: 'r', expiresIn: '15m' };
  const options = { accessSecret: 's'.repeat(40), bcryptRounds: 4 };

  beforeEach(() => {
    users = {
      findByEmail: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async (data) => ({ id: 'u1', role: 'USER', ...data })),
    };
    tokens = { issueForNewSession: jest.fn().mockResolvedValue(tokenPair) };
    logger = { auditAuth: jest.fn(), error: jest.fn() };
    // clevscaffold:messaging:start
    messaging = { dispatch: jest.fn().mockResolvedValue(undefined) };
    // clevscaffold:messaging:end
    service = new AppAuthService(
      users as never,
      tokens as never,
      options as never,
      logger as never,
      // clevscaffold:messaging:start
      messaging as never,
      { get: () => 'https://app.example.com' } as never,
      // clevscaffold:messaging:end
    );
  });

  it('still registers via the base flow (hash + tokens)', async () => {
    const result = await service.register({ email: 'a@b.co', password: 'Str0ng!Pass' });
    expect(result).toBe(tokenPair);
    const created = users.create.mock.calls[0][0];
    expect(await bcrypt.compare('Str0ng!Pass', created.passwordHash)).toBe(true);
  });

  // clevscaffold:messaging:start
  describe('welcome email (the onRegistered hook)', () => {
    it('dispatches a WELCOME message on register', async () => {
      await service.register({ email: 'a@b.co', password: 'Str0ng!Pass', displayName: 'Alex' });
      expect(messaging.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          messageType: MessageType.WELCOME,
          userId: 'u1',
          recipient: { email: 'a@b.co' },
          variables: expect.objectContaining({
            displayName: 'Alex',
            displayNameComma: ', Alex!',
            link: 'https://app.example.com',
          }),
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
      await expect(service.register({ email: 'a@b.co', password: 'Str0ng!Pass' })).resolves.toBe(
        tokenPair,
      );
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
