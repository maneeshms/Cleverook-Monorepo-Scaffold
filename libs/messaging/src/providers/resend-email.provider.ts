import { Inject, Injectable, Logger } from '@nestjs/common';
import { Resend, type CreateEmailOptions } from 'resend';
import { Channel } from '../enums/channel.enum';
import {
  ChannelProvider,
  DeliveryResult,
  OutboundDelivery,
} from '../interfaces/channel-provider.interface';
import { MessagingConfigService } from '../services/messaging-config.service';
import { MESSAGING_OPTIONS, MessagingModuleOptions } from '../messaging.options';

/**
 * Live email provider (Resend). Credentials resolve from the DB provider row
 * (encrypted) first, then env fallback (RESEND_API_KEY / RESEND_FROM_EMAIL /
 * RESEND_FROM_NAME). When unconfigured it returns an explicit failure — never a
 * fake success (repo "no mock data" rule). Swapping to SES/SendGrid later is a
 * new provider class + a route change; callers are unaffected.
 */
@Injectable()
export class ResendEmailProvider implements ChannelProvider {
  readonly key = 'resend';
  readonly channels = [Channel.EMAIL];
  private readonly logger = new Logger('ResendEmail');

  constructor(
    private readonly messagingConfig: MessagingConfigService,
    @Inject(MESSAGING_OPTIONS)
    private readonly options: MessagingModuleOptions,
  ) {}

  private async resolveCredentials(): Promise<{ apiKey: string; fromEmail: string; fromName: string }> {
    const provider = await this.messagingConfig.getProvider('resend');
    const dbCreds = provider?.credentials ?? {};
    const dbConfig = provider?.config ?? {};
    const envResend = this.options.resend ?? {};
    return {
      apiKey: dbCreds.apiKey || envResend.apiKey || '',
      fromEmail:
        dbCreds.fromEmail ||
        (dbConfig.fromEmail as string) ||
        envResend.fromEmail ||
        '',
      fromName:
        dbCreds.fromName ||
        (dbConfig.fromName as string) ||
        envResend.fromName ||
        'ClevScaffold',
    };
  }

  async send(d: OutboundDelivery): Promise<DeliveryResult> {
    const { apiKey, fromEmail, fromName } = await this.resolveCredentials();
    if (!apiKey || !fromEmail) {
      return {
        ok: false,
        error: 'Resend not configured (missing API key or from-email). Set RESEND_API_KEY/RESEND_FROM_EMAIL or configure the provider.',
      };
    }

    try {
      const resend = new Resend(apiKey);
      // Resend's type requires at least one of html/text/react; build accordingly.
      const payload = {
        from: `${fromName} <${fromEmail}>`,
        to: d.to,
        subject: d.subject ?? '',
        html: d.html,
        text: d.text ?? d.html ?? '',
      } as CreateEmailOptions;
      const { data, error } = await resend.emails.send(payload);
      if (error) {
        return { ok: false, error: error.message };
      }
      return { ok: true, providerMessageId: data?.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Resend error';
      this.logger.error(`Resend send failed: ${message}`);
      return { ok: false, error: message };
    }
  }
}
