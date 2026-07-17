import { SessionCleanupService } from './session-cleanup.service';

describe('SessionCleanupService', () => {
  const tokens = { purgeExpired: jest.fn() };
  const logger = { log: jest.fn(), error: jest.fn() };

  const makeService = (options: Record<string, unknown> = {}) =>
    new SessionCleanupService(tokens as never, options as never, logger as never);

  beforeEach(() => jest.clearAllMocks());

  it('purges expired sessions and logs success', async () => {
    tokens.purgeExpired.mockResolvedValue(undefined);
    await makeService().purge();
    expect(tokens.purgeExpired).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith('Purged expired sessions', 'SessionCleanup');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('swallows and logs a purge failure (never throws out of the cron)', async () => {
    tokens.purgeExpired.mockRejectedValue(new Error('db down'));
    await expect(makeService().purge()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('db down'),
      expect.anything(),
      'SessionCleanup',
    );
  });

  it('does nothing when the host disabled the cron via options', async () => {
    await makeService({ sessionCleanupCron: false }).purge();
    expect(tokens.purgeExpired).not.toHaveBeenCalled();
  });
});
