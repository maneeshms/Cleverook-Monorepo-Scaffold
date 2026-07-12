import { Injectable } from '@nestjs/common';
import { Channel } from '../enums/channel.enum';
import {
  ChannelProvider,
  DeliveryResult,
  OutboundDelivery,
} from '../interfaces/channel-provider.interface';

/**
 * Dev SMS provider — prints to stdout so phone OTP works locally without a
 * real vendor. Uses console.log directly so it's always visible in Railway logs
 * regardless of the NestJS log level filter.
 */
@Injectable()
export class ConsoleSmsProvider implements ChannelProvider {
  readonly key = 'console-sms';
  readonly channels = [Channel.SMS];

  async send(d: OutboundDelivery): Promise<DeliveryResult> {
    // eslint-disable-next-line no-console -- intentionally bypasses the log-level filter (see class doc)
    console.log(
      `\n📱 [SMS] To: ${d.to}\n` +
      `─────────────────────────────────────────────────\n` +
      (d.body ?? d.text ?? '') +
      `\n─────────────────────────────────────────────────\n`,
    );
    return { ok: true, providerMessageId: `console-sms-${Date.now()}` };
  }
}
