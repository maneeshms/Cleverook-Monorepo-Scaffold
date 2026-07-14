import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LoggerService } from '@clevrook/logger';
import { TokenService } from './token.service';

/**
 * Housekeeping cron: purges expired refresh-token sessions so `user_sessions`
 * cannot grow unbounded. Runs hourly on every instance — the DELETE is idempotent
 * and cheap (indexed on expires_at semantics), so overlap across replicas is
 * harmless. For very large fleets, move this behind a leader-election lock or a
 * dedicated scheduler service (see docs/ROADMAP.md).
 */
@Injectable()
export class SessionCleanupService {
  constructor(
    private readonly tokens: TokenService,
    private readonly logger: LoggerService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'purge-expired-sessions' })
  async purge(): Promise<void> {
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
