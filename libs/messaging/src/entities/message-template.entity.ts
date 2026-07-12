import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@clevscaffold/database';

/**
 * DB override for the in-code template registry, keyed by (key, channel, locale).
 * When a row exists and is enabled it wins over the code default; otherwise the
 * code registry is used. This is the "DB" half of the code + DB-override model.
 */
@Entity('message_templates')
@Index(['key', 'channel', 'locale'], { unique: true })
export class MessageTemplate extends BaseEntity {
  @Column({ type: 'varchar', length: 80 })
  key: string;

  @Column({ type: 'varchar', length: 20 })
  channel: string;

  @Column({ type: 'varchar', length: 10, default: 'en' })
  locale: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  subject: string | null;

  @Column({ name: 'body_html', type: 'text', nullable: true })
  bodyHtml: string | null;

  @Column({ name: 'body_text', type: 'text', nullable: true })
  bodyText: string | null;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;
}
