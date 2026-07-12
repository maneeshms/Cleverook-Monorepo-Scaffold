import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@clevscaffold/database';

export enum DeliveryStatus {
  QUEUED = 'QUEUED',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

/** Per-attempt audit record of an outbound message (observability + a future CMS log). */
@Entity('message_deliveries')
export class MessageDelivery extends BaseEntity {
  @Index()
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Index()
  @Column({ name: 'message_type', type: 'varchar', length: 80 })
  messageType: string;

  @Column({ type: 'varchar', length: 20 })
  channel: string;

  @Column({ name: 'provider_key', type: 'varchar', length: 50 })
  providerKey: string;

  /** Masked destination (e.g. a***@x.com / +1******71) — never store raw PII in the log. */
  @Column({ name: 'to_masked', type: 'varchar', length: 200, nullable: true })
  toMasked: string | null;

  @Column({ type: 'varchar', length: 20, default: DeliveryStatus.QUEUED })
  status: DeliveryStatus;

  @Column({ name: 'provider_message_id', type: 'varchar', length: 200, nullable: true })
  providerMessageId: string | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;
}
