import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { LoggerService } from '@clevscaffold/logger';
import { RedisService } from '@clevscaffold/common';
import {
  CHANNEL_PROVIDERS,
  ChannelProvider,
  OutboundDelivery,
} from '../interfaces/channel-provider.interface';
import { Channel } from '../enums/channel.enum';
import { MessageDelivery, DeliveryStatus } from '../entities/message-delivery.entity';
import { MESSAGING_OPTIONS, MessagingModuleOptions } from '../messaging.options';

const QUEUE_NAME = 'messaging';

export interface DeliveryJob {
  messageType: string;
  userId: string | null;
  delivery: OutboundDelivery;
  providerKey: string;
  fallbackProviderKey: string | null;
}

function connectionFromUrl(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? parseInt(u.port, 10) : 6379,
    username: u.username || undefined,
    password: u.password || undefined,
    db: u.pathname && u.pathname.length > 1 ? parseInt(u.pathname.slice(1), 10) : undefined,
    tls: u.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

/**
 * Generalized async delivery for ALL channels (was EmailQueueService).
 *
 * - With Redis: one BullMQ job per channel delivery, retried with backoff, so a
 *   slow/failing provider never blocks the request and multi-channel fan-out
 *   runs independently/in parallel.
 * - Without Redis: honest inline delivery (a real send, just synchronous).
 *
 * The worker resolves the target provider by key from the injected provider
 * array, sends, writes a MessageDelivery audit row, and falls back to the
 * fallback provider on failure.
 */
@Injectable()
export class DeliveryQueueService implements OnModuleInit, OnModuleDestroy {
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    @Inject(CHANNEL_PROVIDERS) private readonly providers: ChannelProvider[],
    @InjectRepository(MessageDelivery)
    private readonly deliveries: Repository<MessageDelivery>,
    @Inject(MESSAGING_OPTIONS)
    private readonly options: MessagingModuleOptions,
    private readonly redis: RedisService,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit(): void {
    const url = this.options.redisUrl;
    if (!this.redis.isEnabled() || !url) return; // inline mode

    const connection = connectionFromUrl(url);
    this.queue = new Queue(QUEUE_NAME, { connection });
    this.worker = new Worker<DeliveryJob>(
      QUEUE_NAME,
      async (job) => {
        await this.processDelivery(job.data);
      },
      { connection },
    );

    // Node 15+ turns unhandled EventEmitter 'error' events into process-killing
    // exceptions — attach handlers so a Redis hiccup never silently crashes.
    this.queue.on('error', (err) =>
      this.logger.error(`Messaging queue error: ${err.message}`, undefined, 'Messaging'),
    );
    this.worker.on('error', (err) =>
      this.logger.error(`Messaging worker error: ${err.message}`, undefined, 'Messaging'),
    );
    this.worker.on('failed', (job, err) =>
      this.logger.error(`Messaging job ${job?.id} failed: ${err.message}`, undefined, 'Messaging'),
    );
    this.logger.log('Messaging queue started (BullMQ, Redis-backed).', 'Messaging');
  }

  isAsync(): boolean {
    return this.queue !== null;
  }

  async enqueue(job: DeliveryJob): Promise<void> {
    if (this.queue) {
      await this.queue.add('deliver', job, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 200,
        removeOnFail: 1000,
      });
    } else {
      await this.processDelivery(job);
    }
  }

  /** Send via the resolved provider, record the attempt, fall back on failure. */
  async processDelivery(job: DeliveryJob): Promise<void> {
    const record = this.deliveries.create({
      userId: job.userId,
      messageType: job.messageType,
      channel: job.delivery.channel,
      providerKey: job.providerKey,
      toMasked: this.mask(job.delivery.channel, job.delivery.to),
      status: DeliveryStatus.QUEUED,
      attempts: 0,
    });

    const primary = this.findProvider(job.providerKey);
    let result = await this.trySend(primary, job.providerKey, job.delivery, record);

    if (!result.ok && job.fallbackProviderKey) {
      record.providerKey = job.fallbackProviderKey;
      const fallback = this.findProvider(job.fallbackProviderKey);
      result = await this.trySend(fallback, job.fallbackProviderKey, job.delivery, record);
    }

    record.status = result.ok ? DeliveryStatus.SENT : DeliveryStatus.FAILED;
    record.providerMessageId = result.providerMessageId ?? null;
    record.error = result.ok ? null : (result.error ?? 'Unknown error');
    await this.deliveries.save(record);

    if (!result.ok) {
      this.logger.error(
        `Delivery failed [${job.messageType}/${job.delivery.channel}]: ${record.error}`,
        undefined,
        'Messaging',
      );
    }
  }

  private async trySend(
    provider: ChannelProvider | undefined,
    providerKey: string,
    delivery: OutboundDelivery,
    record: MessageDelivery,
  ) {
    record.attempts += 1;
    if (!provider) {
      return { ok: false, error: `Provider '${providerKey}' not registered` };
    }
    try {
      return await provider.send(delivery);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'send threw' };
    }
  }

  private findProvider(key: string): ChannelProvider | undefined {
    return this.providers.find((p) => p.key === key);
  }

  /** Mask PII in the audit log (a***@x.com / +1****71 / userId). */
  private mask(channel: Channel, to: string): string {
    if (channel === Channel.EMAIL) {
      const [local, domain] = to.split('@');
      if (!domain) return '***';
      return `${local.slice(0, 1)}***@${domain}`;
    }
    if (channel === Channel.SMS || channel === Channel.WHATSAPP) {
      return to.length > 4 ? `${to.slice(0, 2)}****${to.slice(-2)}` : '****';
    }
    return to;
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close().catch(() => undefined);
    await this.queue?.close().catch(() => undefined);
  }
}
