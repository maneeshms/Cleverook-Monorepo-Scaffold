import { MessagingModule } from './messaging.module';
import { MESSAGING_OPTIONS } from './messaging.options';
import { CHANNEL_PROVIDERS } from './interfaces/channel-provider.interface';
import { ConsoleEmailProvider } from './providers/console-email.provider';
import { ConsoleSmsProvider } from './providers/console-sms.provider';
import { ConsolePushProvider } from './providers/console-push.provider';
import { InAppProvider } from './providers/in-app.provider';

describe('MessagingModule.forRootAsync', () => {
  const dynamicModule = MessagingModule.forRootAsync({
    inject: ['SOME_CONFIG'],
    useFactory: () => ({ encryptionKey: 'k' }),
  });

  it('registers globally with the options provider wired to the host factory', () => {
    expect(dynamicModule.global).toBe(true);
    const optionsProvider = (dynamicModule.providers as any[]).find(
      (p) => p.provide === MESSAGING_OPTIONS,
    );
    expect(optionsProvider.inject).toEqual(['SOME_CONFIG']);
    expect(optionsProvider.useFactory()).toEqual({ encryptionKey: 'k' });
  });

  it('defaults imports/inject when omitted', () => {
    const bare = MessagingModule.forRootAsync({ useFactory: () => ({ encryptionKey: 'k' }) });
    const optionsProvider = (bare.providers as any[]).find((p) => p.provide === MESSAGING_OPTIONS);
    expect(optionsProvider.inject).toEqual([]);
    expect(bare.imports?.length).toBeGreaterThan(0); // TypeOrmModule.forFeature entities
  });

  it('collects every channel provider under CHANNEL_PROVIDERS', () => {
    const providersFactory = (dynamicModule.providers as any[]).find(
      (p) => p.provide === CHANNEL_PROVIDERS,
    );
    const resend = { key: 'resend' };
    const consoleEmail = new ConsoleEmailProvider();
    const consoleSms = new ConsoleSmsProvider();
    const inApp = new InAppProvider(undefined);
    const fcmPush = { key: 'fcm' };
    const consolePush = new ConsolePushProvider();
    const collected = providersFactory.useFactory(
      resend,
      consoleEmail,
      consoleSms,
      inApp,
      fcmPush,
      consolePush,
    );
    expect(collected.map((p: { key: string }) => p.key)).toEqual([
      'resend',
      'console-email',
      'console-sms',
      'in-app',
      'fcm',
      'console-push',
    ]);
  });

  it('exports the public service surface', () => {
    expect(dynamicModule.exports?.length).toBeGreaterThan(0);
  });
});
