import { Column, Entity } from 'typeorm';
import { BaseEntity } from '@clevrook/database';

/**
 * One delivery provider (resend, console-email, console-sms, in-app, …).
 * Secret credentials are AES-256-GCM encrypted in credentials_enc; non-secret
 * settings live in config (jsonb).
 */
@Entity('messaging_provider_configs')
export class MessagingProviderConfig extends BaseEntity {
  @Column({ name: 'provider_key', type: 'varchar', length: 50, unique: true })
  providerKey: string;

  @Column({ name: 'display_name', type: 'varchar', length: 100 })
  displayName: string;

  /** CSV of Channel values this provider can deliver, e.g. "EMAIL" or "SMS,WHATSAPP". */
  @Column({ type: 'varchar', length: 200, default: '' })
  channels: string;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  /** AES-256-GCM encrypted JSON of secrets (apiKey, authToken, …). Null = unset. */
  @Column({ name: 'credentials_enc', type: 'text', nullable: true, select: false })
  credentialsEnc: string | null;

  /** Non-secret provider settings (fromName, region, …). */
  @Column({ type: 'jsonb', nullable: true })
  config: Record<string, unknown> | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;
}
