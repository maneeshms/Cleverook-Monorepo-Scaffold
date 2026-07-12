import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis, { Redis } from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * Holds a single shared ioredis connection when REDIS_URL is configured, and
 * `null` otherwise. There is no mock/fake Redis: callers that need Redis-only
 * behaviour (distributed rate limiting, queues) degrade to an explicit local
 * fallback (in-memory throttle, inline delivery) when the client is null.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis | null;

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL');
    if (!url) {
      this.client = null;
      this.logger.log('REDIS_URL not set — using in-memory throttling and inline jobs.');
      return;
    }
    this.client = new IORedis(url, {
      maxRetriesPerRequest: null, // required by BullMQ-style consumers
      enableReadyCheck: true,
    });
    this.client.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
    this.client.on('connect', () => this.logger.log('Connected to Redis.'));
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
    }
  }
}
