import { Channel } from '../enums/channel.enum';

/** A rendered, ready-to-send message for one channel. */
export interface OutboundDelivery {
  channel: Channel;
  to: string; // email address / E.164 phone / push token / userId (in-app)
  subject?: string; // email
  html?: string; // email
  text?: string; // email plaintext part
  body?: string; // sms / whatsapp / push / in-app
  metadata?: Record<string, unknown>;
}

export interface DeliveryResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

/**
 * A concrete integration that delivers on one or more channels. Implementations
 * are registered under the CHANNEL_PROVIDERS array token and resolved by `key`.
 */
export interface ChannelProvider {
  readonly key: string; // 'resend' | 'console-email' | 'console-sms' | 'in-app' | …
  readonly channels: Channel[];
  send(delivery: OutboundDelivery): Promise<DeliveryResult>;
}

/** Multi-provider DI token — inject as `@Inject(CHANNEL_PROVIDERS) providers: ChannelProvider[]`. */
export const CHANNEL_PROVIDERS = 'CHANNEL_PROVIDERS';
