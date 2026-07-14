import { Injectable } from '@nestjs/common';
import { Channel } from '../enums/channel.enum';
import {
  ChannelProvider,
  DeliveryResult,
  OutboundDelivery,
} from '../interfaces/channel-provider.interface';

/**
 * Dev / escape-hatch email provider — prints to stdout instead of sending.
 * Uses console.log directly so it's visible regardless of the NestJS log level
 * filter (which suppresses `this.logger.log()` at warn/error-only settings).
 */
@Injectable()
export class ConsoleEmailProvider implements ChannelProvider {
  readonly key = 'console-email';
  readonly channels = [Channel.EMAIL];

  async send(d: OutboundDelivery): Promise<DeliveryResult> {
    // eslint-disable-next-line no-console -- intentionally bypasses the log-level filter (see class doc)
    console.log(
      `\n📧 [EMAIL] To: ${d.to} | Subject: ${d.subject ?? '(no subject)'}\n` +
        `─────────────────────────────────────────────────\n` +
        (d.text ?? '(html-only, no text fallback)') +
        `\n─────────────────────────────────────────────────\n`,
    );
    return { ok: true, providerMessageId: `console-${Date.now()}` };
  }
}
