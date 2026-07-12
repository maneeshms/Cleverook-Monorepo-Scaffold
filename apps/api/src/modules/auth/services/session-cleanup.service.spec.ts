import { SessionCleanupService } from './session-cleanup.service';

describe('SessionCleanupService', () => {
  const tokens = { purgeExpired: jest.fn() };
  const logger = { log: jest.fn(), error: jest.fn() };
  let service: SessionCleanupService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SessionCleanupService(tokens as never, logger as never);
  });

  it('purges expired sessions and logs success', async () => {
    tokens.purgeExpired.mockResolvedValue(undefined);
    await service.purge();
    expect(tokens.purgeExpired).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith('Purged expired sessions', 'SessionCleanup');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('swallows and logs a purge failure (never throws out of the cron)', async () => {
    tokens.purgeExpired.mockRejectedValue(new Error('db down'));
    await expect(service.purge()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('db down'),
      expect.anything(),
      'SessionCleanup',
    );
  });
});
