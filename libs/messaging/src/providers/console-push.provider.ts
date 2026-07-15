import { Injectable } from '@nestjs/common';
import { Channel } from '../enums/channel.enum';
import {
  ChannelProvider,
  DeliveryResult,
  OutboundDelivery,
} from '../interfaces/channel-provider.interface';

/**
 * Dev / escape-hatch push provider — prints to stdout instead of sending.
 * The default PUSH route until FCM is configured (FCM_SERVICE_ACCOUNT_JSON),
 * so local dev sees every would-be notification without a Firebase project.
 */
@Injectable()
export class ConsolePushProvider implements ChannelProvider {
  readonly key = 'console-push';
  readonly channels = [Channel.PUSH];

  async send(d: OutboundDelivery): Promise<DeliveryResult> {
    const token = d.to.length > 12 ? `${d.to.slice(0, 8)}…` : d.to;
    // eslint-disable-next-line no-console -- intentionally bypasses the log-level filter (see class doc)
    console.log(
      `\n🔔 [PUSH] Token: ${token} | Title: ${d.subject ?? '(no title)'}\n` +
        `─────────────────────────────────────────────────\n` +
        (d.body ?? d.text ?? '(no body)') +
        `\n─────────────────────────────────────────────────\n`,
    );
    return { ok: true, providerMessageId: `console-${Date.now()}` };
  }
}
