import { DynamicModule, Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagingProviderConfig } from './entities/messaging-provider-config.entity';
import { MessagingChannelRoute } from './entities/messaging-channel-route.entity';
import { MessageTemplate } from './entities/message-template.entity';
import { MessageDelivery } from './entities/message-delivery.entity';
import { MessagingConfigService } from './services/messaging-config.service';
import { TemplateService } from './services/template.service';
import { DeliveryQueueService } from './services/delivery-queue.service';
import { MessagingService } from './services/messaging.service';
import { ResendEmailProvider } from './providers/resend-email.provider';
import { ConsoleEmailProvider } from './providers/console-email.provider';
import { ConsoleSmsProvider } from './providers/console-sms.provider';
import { InAppProvider } from './providers/in-app.provider';
import { CHANNEL_PROVIDERS } from './interfaces/channel-provider.interface';
import {
  MESSAGING_OPTIONS,
  MessagingModuleAsyncOptions,
} from './messaging.options';

/**
 * The omnichannel messaging engine, as a reusable NestJS library.
 *
 * The host app registers it with `MessagingModule.forRootAsync({...})`, supplying
 * runtime config (encryption key, Redis URL, Resend fallbacks) built from its own
 * ConfigService. The library reads no env/app-config itself — that's what keeps it
 * portable across apps (api, cms, a future worker) and projects.
 *
 * For the IN_APP channel, have the host register an InAppSink under the
 * `IN_APP_SINK` token (e.g. via a module passed in `imports`).
 *
 * Registered global so any module can inject `MessagingService` without re-importing.
 */
@Global()
@Module({})
export class MessagingModule {
  static forRootAsync(options: MessagingModuleAsyncOptions): DynamicModule {
    return {
      module: MessagingModule,
      global: true,
      imports: [
        ...(options.imports ?? []),
        TypeOrmModule.forFeature([
          MessagingProviderConfig,
          MessagingChannelRoute,
          MessageTemplate,
          MessageDelivery,
        ]),
      ],
      providers: [
        {
          provide: MESSAGING_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        MessagingConfigService,
        TemplateService,
        DeliveryQueueService,
        MessagingService,
        ResendEmailProvider,
        ConsoleEmailProvider,
        ConsoleSmsProvider,
        InAppProvider,
        {
          provide: CHANNEL_PROVIDERS,
          useFactory: (
            resend: ResendEmailProvider,
            consoleEmail: ConsoleEmailProvider,
            consoleSms: ConsoleSmsProvider,
            inApp: InAppProvider,
          ) => [resend, consoleEmail, consoleSms, inApp],
          inject: [ResendEmailProvider, ConsoleEmailProvider, ConsoleSmsProvider, InAppProvider],
        },
      ],
      exports: [MessagingService, MessagingConfigService],
    };
  }
}
