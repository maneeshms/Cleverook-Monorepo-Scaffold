import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@clevrook/database';

/**
 * Maps a channel (optionally scoped to a use_case) to a primary provider and an
 * optional fallback. A null use_case is the global default for that channel.
 */
@Entity('messaging_channel_routes')
@Index(['channel', 'useCase'], { unique: true })
export class MessagingChannelRoute extends BaseEntity {
  @Column({ type: 'varchar', length: 20 })
  channel: string;

  /** Null = global default. Non-null = per-message-type override (future). */
  @Column({ name: 'use_case', type: 'varchar', length: 80, nullable: true })
  useCase: string | null;

  @Column({ name: 'primary_provider_key', type: 'varchar', length: 50 })
  primaryProviderKey: string;

  @Column({ name: 'fallback_provider_key', type: 'varchar', length: 50, nullable: true })
  fallbackProviderKey: string | null;
}
