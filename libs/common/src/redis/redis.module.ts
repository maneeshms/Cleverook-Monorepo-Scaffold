import { Global, Module } from '@nestjs/common';
import { RedisService, REDIS_CLIENT } from './redis.service';

/**
 * Global Redis access. Provides the shared client both as `RedisService`
 * (lifecycle-managed) and as the `REDIS_CLIENT` token (the raw ioredis instance
 * or null) so consumers like the ThrottlerModule can inject it directly.
 */
@Global()
@Module({
  providers: [
    RedisService,
    {
      provide: REDIS_CLIENT,
      useFactory: (redis: RedisService) => redis.client,
      inject: [RedisService],
    },
  ],
  exports: [RedisService, REDIS_CLIENT],
})
export class RedisModule {}
