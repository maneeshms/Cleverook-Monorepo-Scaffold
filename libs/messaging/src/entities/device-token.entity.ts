import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@clevrook/database';
import { DevicePlatform } from '../enums/device-platform.enum';

/**
 * One push-capable device registration (FCM registration token). A user has one
 * row per device/app install; the PUSH channel fans out to all of them. Tokens
 * are personal data: the host's compliance wiring registers this table for GDPR
 * export/erasure and stale-token retention.
 */
@Entity('device_tokens')
export class DeviceToken extends BaseEntity {
  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** The FCM registration token — unique per device+app install, any owner. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 512 })
  token: string;

  @Column({ type: 'varchar', length: 10 })
  platform: DevicePlatform;

  /** Refreshed on every register call — drives stale-registration retention. */
  @Column({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt: Date;
}
