import { SecretCipher } from '@clevscaffold/common';
import { Channel } from '../enums/channel.enum';
import { MessagingConfigService } from './messaging-config.service';

const ENCRYPTION_KEY = 'unit-test-encryption-key';

const providerRow = (overrides: Record<string, unknown> = {}) => ({
  providerKey: 'resend',
  enabled: true,
  config: { fromName: 'X' },
  credentialsEnc: new SecretCipher(ENCRYPTION_KEY).encrypt(JSON.stringify({ apiKey: 'db_key' })),
  sortOrder: 1,
  ...overrides,
});

const makeService = ({
  providerRows = [] as unknown[],
  routeRows = [] as unknown[],
  options = {} as Record<string, unknown>,
} = {}) => {
  const getMany = jest.fn().mockResolvedValue(providerRows);
  const providerRepo = {
    createQueryBuilder: jest.fn().mockReturnValue({
      addSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany,
    }),
  };
  const routeRepo = { find: jest.fn().mockResolvedValue(routeRows) };
  const service = new MessagingConfigService(
    providerRepo as never,
    routeRepo as never,
    { encryptionKey: ENCRYPTION_KEY, ...options } as never,
  );
  return { service, providerRepo, routeRepo, getMany };
};

describe('MessagingConfigService', () => {
  it('loads providers and decrypts credentials', async () => {
    const { service } = makeService({ providerRows: [providerRow()] });
    await service.refresh();
    const provider = await service.getProvider('resend');
    expect(provider).toEqual({
      providerKey: 'resend',
      enabled: true,
      config: { fromName: 'X' },
      credentials: { apiKey: 'db_key' },
    });
  });

  it('treats undecryptable or malformed credentials as empty', async () => {
    const badCipher = providerRow({ credentialsEnc: 'not-decryptable' });
    const badJson = providerRow({
      providerKey: 'other',
      credentialsEnc: new SecretCipher(ENCRYPTION_KEY).encrypt('not json'),
    });
    const noConfig = providerRow({ providerKey: 'bare', config: null, credentialsEnc: null });
    const { service } = makeService({ providerRows: [badCipher, badJson, noConfig] });
    await service.refresh();
    expect((await service.getProvider('resend'))!.credentials).toEqual({});
    expect((await service.getProvider('other'))!.credentials).toEqual({});
    expect((await service.getProvider('bare'))!.config).toEqual({});
    expect(await service.getProvider('missing')).toBeNull();
  });

  it('onModuleInit survives a missing table (migration not run yet)', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const { service, getMany } = makeService();
    getMany.mockRejectedValueOnce(new Error('relation does not exist'));
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  describe('routeFor', () => {
    const routeRows = [
      { channel: Channel.EMAIL, useCase: null, primaryProviderKey: 'resend', fallbackProviderKey: 'console-email' },
      { channel: Channel.EMAIL, useCase: 'otp', primaryProviderKey: 'console-email', fallbackProviderKey: null },
    ];

    it('prefers the use_case-scoped route, then the global route', async () => {
      const { service } = makeService({ routeRows });
      await service.refresh();
      expect(await service.routeFor(Channel.EMAIL, 'otp')).toEqual({
        primary: 'console-email',
        fallback: null,
      });
      expect(await service.routeFor(Channel.EMAIL, 'welcome')).toEqual({
        primary: 'resend',
        fallback: 'console-email',
      });
      expect(await service.routeFor(Channel.EMAIL)).toEqual({
        primary: 'resend',
        fallback: 'console-email',
      });
    });

    it('honours the emailProviderOverride switch', async () => {
      const { service } = makeService({
        routeRows,
        options: { emailProviderOverride: 'console-email' },
      });
      await service.refresh();
      expect(await service.routeFor(Channel.EMAIL)).toEqual({
        primary: 'console-email',
        fallback: 'console-email',
      });
    });

    it('defaults EMAIL by resend-key presence when no route exists', async () => {
      const withKey = makeService({ options: { resend: { apiKey: 'k' } } }).service;
      await withKey.refresh();
      expect(await withKey.routeFor(Channel.EMAIL)).toEqual({
        primary: 'resend',
        fallback: 'console-email',
      });

      const withoutKey = makeService().service;
      await withoutKey.refresh();
      expect(await withoutKey.routeFor(Channel.EMAIL)).toEqual({
        primary: 'console-email',
        fallback: 'console-email',
      });
    });

    it('provides built-in defaults for SMS, IN_APP and unknown channels', async () => {
      const { service } = makeService();
      await service.refresh();
      expect(await service.routeFor(Channel.SMS)).toEqual({ primary: 'console-sms', fallback: null });
      expect(await service.routeFor(Channel.IN_APP)).toEqual({ primary: 'in-app', fallback: null });
      expect(await service.routeFor('CARRIER_PIGEON' as Channel)).toEqual({
        primary: 'console-email',
        fallback: null,
      });
    });
  });

  it('keeps the stale cache and backs off when a refresh fails', async () => {
    const { service, getMany } = makeService({ providerRows: [providerRow()] });
    await service.refresh();
    // expire the cache, then make the next refresh blow up
    (service as never as { cacheExpiry: number }).cacheExpiry = 0;
    getMany.mockRejectedValueOnce(new Error('db blip'));
    const provider = await service.getProvider('resend');
    expect(provider).not.toBeNull(); // stale data served
    expect((service as never as { cacheExpiry: number }).cacheExpiry).toBeGreaterThan(Date.now() - 1);
  });

  it('re-reads the DB once the cache expires', async () => {
    const { service, getMany } = makeService({ providerRows: [providerRow()] });
    await service.refresh();
    expect(getMany).toHaveBeenCalledTimes(1);
    (service as never as { cacheExpiry: number }).cacheExpiry = 0;
    await service.getProvider('resend');
    expect(getMany).toHaveBeenCalledTimes(2);
  });
});
