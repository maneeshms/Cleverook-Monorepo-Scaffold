import type { Redis } from 'ioredis';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import type { ThrottlerStorage } from '@nestjs/throttler';

/**
 * Returns a Redis-backed throttler storage when a client is available, so per-IP
 * and per-user rate limits are enforced **globally across instances** (NFR-SEC-7,
 * NFR-SCALE-1). Returns undefined when Redis is not configured — the
 * ThrottlerModule then uses its default in-memory storage (correct for a single
 * instance; loosens proportionally to instance count without Redis).
 */
export function redisThrottlerStorage(client: Redis | null): ThrottlerStorage | undefined {
  return client ? new ThrottlerStorageRedisService(client) : undefined;
}
