import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@clevrook/database';

/**
 * In-app notification feed row. Written by NotificationsService, which also
 * backs the messaging library's IN_APP channel (see in-app-sink.module.ts).
 */
@Entity('notifications')
export class Notification extends BaseEntity {
  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  // Event discriminator, e.g. 'TASK_ASSIGNED'. Free-form so new features don't
  // need a migration to introduce a type.
  @Column({ type: 'varchar', length: 80, nullable: true })
  type: string | null;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  body: string | null;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;
}
