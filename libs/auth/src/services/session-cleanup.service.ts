import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LoggerService } from '@clevrook/logger';
import { TokenService } from './token.service';
import { AUTH_OPTIONS, AuthModuleOptions } from '../auth.options';

/**
 * Housekeeping cron: purges expired refresh-token sessions so `user_sessions`
 * cannot grow unbounded. Runs hourly on every instance — the DELETE is idempotent
 * and cheap, so overlap across replicas is harmless. The host must register
 * `ScheduleModule.forRoot()`; disable via options.sessionCleanupCron = false to
 * drive `TokenService.purgeExpired()` from an external scheduler instead.
 */
@Injectable()
export class SessionCleanupService {
  constructor(
    private readonly tokens: TokenService,
    @Inject(AUTH_OPTIONS)
    private readonly options: AuthModuleOptions,
    private readonly logger: LoggerService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'purge-expired-sessions' })
  async purge(): Promise<void> {
    if (this.options.sessionCleanupCron === false) return;
    try {
      await this.tokens.purgeExpired();
      this.logger.log('Purged expired sessions', 'SessionCleanup');
    } catch (err) {
      this.logger.error(
        `Session purge failed: ${(err as Error).message}`,
        (err as Error).stack,
        'SessionCleanup',
      );
    }
  }
}
