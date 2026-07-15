import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { DeviceToken } from '../entities/device-token.entity';
import { DevicePlatform } from '../enums/device-platform.enum';

/** Cap per user so a hostile client can't inflate PUSH fan-out unboundedly. */
export const MAX_DEVICES_PER_USER = 20;

/**
 * The device-token registry behind the PUSH channel. The host app exposes the
 * register/unregister endpoints; `MessagingService` fans PUSH deliveries out to
 * `tokensForUser`, and the delivery pipeline prunes tokens FCM reports dead.
 */
@Injectable()
export class DeviceTokenService {
  constructor(
    @InjectRepository(DeviceToken)
    private readonly tokens: Repository<DeviceToken>,
  ) {}

  /**
   * Idempotent upsert by token. A token that changes hands (new login on the
   * same device) follows its current user — one device never notifies two users.
   */
  async register(userId: string, token: string, platform: DevicePlatform): Promise<DeviceToken> {
    const existing = await this.tokens.findOne({ where: { token } });
    if (existing) {
      existing.userId = userId;
      existing.platform = platform;
      existing.lastSeenAt = new Date();
      return this.tokens.save(existing);
    }

    // At the cap, evict the stalest registration instead of rejecting — the
    // user's newest device is always the one they expect to buzz.
    const count = await this.tokens.count({ where: { userId } });
    if (count >= MAX_DEVICES_PER_USER) {
      const [stalest] = await this.tokens.find({
        where: { userId },
        order: { lastSeenAt: 'ASC' },
        take: 1,
      });
      if (stalest) await this.tokens.delete({ id: stalest.id });
    }

    return this.tokens.save(
      this.tokens.create({ userId, token, platform, lastSeenAt: new Date() }),
    );
  }

  /** Remove one of the CALLER's registrations (scoped to userId — BOLA-safe). */
  async unregister(userId: string, token: string): Promise<number> {
    const res = await this.tokens.delete({ userId, token });
    return res.affected ?? 0;
  }

  async listForUser(userId: string): Promise<DeviceToken[]> {
    return this.tokens.find({ where: { userId }, order: { lastSeenAt: 'DESC' } });
  }

  async tokensForUser(userId: string): Promise<string[]> {
    return (await this.listForUser(userId)).map((t) => t.token);
  }

  /** Prune a token FCM reported dead — the token itself is invalid, any owner. */
  async removeToken(token: string): Promise<void> {
    await this.tokens.delete({ token });
  }

  /** Storage limitation: purge registrations not seen since `olderThan`. */
  async purgeStale(olderThan: Date): Promise<number> {
    const res = await this.tokens.delete({ lastSeenAt: LessThan(olderThan) });
    return res.affected ?? 0;
  }

  /** GDPR erasure hook for the host's compliance wiring. */
  async eraseForUser(userId: string): Promise<number> {
    const res = await this.tokens.delete({ userId });
    return res.affected ?? 0;
  }
}
