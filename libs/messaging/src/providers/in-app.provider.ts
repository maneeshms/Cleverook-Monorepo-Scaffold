import { Inject, Injectable, Optional } from '@nestjs/common';
import { Channel } from '../enums/channel.enum';
import {
  ChannelProvider,
  DeliveryResult,
  OutboundDelivery,
} from '../interfaces/channel-provider.interface';
import { IN_APP_SINK, InAppSink } from '../interfaces/in-app-sink.interface';

/**
 * IN_APP channel provider — makes "in-app" just another delivery channel by
 * delegating to the host-provided {@link InAppSink} (the host owns the feed
 * schema, so the library stays decoupled from any app entity). `to` is the
 * userId; `metadata` may carry `notificationType`, `title`, and `payload`.
 *
 * If the host didn't register a sink, this returns an honest failure rather than
 * pretending the message was delivered (no-mock-data rule).
 */
@Injectable()
export class InAppProvider implements ChannelProvider {
  readonly key = 'in-app';
  readonly channels = [Channel.IN_APP];

  constructor(@Optional() @Inject(IN_APP_SINK) private readonly sink?: InAppSink) {}

  async send(d: OutboundDelivery): Promise<DeliveryResult> {
    if (!this.sink) {
      return { ok: false, error: 'No in-app sink registered for the IN_APP channel.' };
    }
    const meta = d.metadata ?? {};
    const id = await this.sink.deliver({
      userId: d.to,
      type: meta.notificationType as string | undefined,
      title: (meta.title as string) ?? d.body ?? '',
      body: d.body,
      payload: (meta.payload as Record<string, unknown>) ?? null,
    });
    return { ok: true, providerMessageId: typeof id === 'string' ? id : undefined };
  }
}
