import { Injectable, Logger } from '@nestjs/common';
import { Channel } from '../enums/channel.enum';
import {
  MESSAGE_TYPE_DEFINITIONS,
  MessageType,
} from '../enums/message-type';
import { OutboundDelivery } from '../interfaces/channel-provider.interface';
import { MessagingConfigService } from './messaging-config.service';
import { TemplateService } from './template.service';
import { DeliveryQueueService } from './delivery-queue.service';

export interface DispatchRecipient {
  email?: string | null;
  phone?: string | null; // E.164
  pushToken?: string | null;
}

export interface DispatchInput {
  messageType: MessageType;
  userId?: string | null;
  variables?: Record<string, unknown>;
  /** Narrow the message type's channel set to a single channel (per-use-case hook). */
  channelOverride?: Channel;
  /** Contact points — the caller supplies these so messaging stays user-lookup free. */
  recipient?: DispatchRecipient;
  locale?: string;
  /** Extra per-channel metadata (e.g. in-app notificationType/title/payload). */
  metadata?: Record<string, unknown>;
}

/**
 * Orchestrates outbound messaging: resolve the message type → channel set,
 * render each channel's template, route to a provider, and enqueue one
 * independent delivery job per channel (fan-out). Callers just say WHAT to send
 * and to WHOM; routing/provider/template are resolved here.
 */
@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    private readonly configService: MessagingConfigService,
    private readonly templates: TemplateService,
    private readonly queue: DeliveryQueueService,
  ) {}

  async dispatch(input: DispatchInput): Promise<void> {
    const def = MESSAGE_TYPE_DEFINITIONS[input.messageType];
    if (!def) {
      this.logger.warn(`Unknown message type: ${input.messageType}`);
      return;
    }

    // Effective channel set = defined ∩ override ∩ (future: user preferences).
    let channels = def.channels;
    if (input.channelOverride) {
      channels = channels.filter((c) => c === input.channelOverride);
    }
    // MARKETING would be gated on preferences here (stub = allow).

    const variables = input.variables ?? {};

    // Fan-out: one independent delivery per resolvable channel.
    await Promise.all(
      channels.map((channel) => this.dispatchChannel(input, def.templateKey, channel, variables)),
    );
  }

  private async dispatchChannel(
    input: DispatchInput,
    templateKey: string,
    channel: Channel,
    variables: Record<string, unknown>,
  ): Promise<void> {
    const to = this.resolveDestination(channel, input);
    if (!to) {
      this.logger.debug(`Skipping ${channel} for ${input.messageType}: no contact point`);
      return;
    }

    const rendered = await this.templates.render(templateKey, channel, variables, input.locale ?? 'en');

    const delivery: OutboundDelivery = {
      channel,
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      body: rendered.text, // sms/whatsapp/in-app use the text part as the body
      metadata: input.metadata,
    };

    const route = await this.configService.routeFor(channel);
    await this.queue.enqueue({
      messageType: input.messageType,
      userId: input.userId ?? null,
      delivery,
      providerKey: route.primary,
      fallbackProviderKey: route.fallback,
    });
  }

  private resolveDestination(channel: Channel, input: DispatchInput): string | null {
    const r = input.recipient ?? {};
    switch (channel) {
      case Channel.EMAIL:
        return r.email ?? null;
      case Channel.SMS:
      case Channel.WHATSAPP:
        return r.phone ?? null;
      case Channel.PUSH:
        return r.pushToken ?? null;
      case Channel.IN_APP:
        return input.userId ?? null;
      default:
        return null;
    }
  }
}
