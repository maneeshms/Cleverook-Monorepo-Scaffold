import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Consent ledger (GDPR Art. 6/7 — lawful basis + demonstrable consent).
 *
 * Append-only: every grant/withdrawal is a new immutable row, so the full consent
 * history is provable (Art. 7(1) "be able to demonstrate"). The CURRENT state for
 * a (user, purpose) is the newest row. Never updated or hard-deleted in place.
 */
@Entity('consent_records')
@Index(['userId', 'purpose', 'createdAt'])
export class ConsentRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** Processing purpose, e.g. 'marketing_email', 'analytics', 'terms_of_service'. */
  @Column({ type: 'varchar', length: 100 })
  purpose: string;

  /** true = granted, false = withdrawn. */
  @Column({ type: 'boolean' })
  granted: boolean;

  /** Version of the policy/notice the subject consented to (for re-consent flows). */
  @Column({ name: 'policy_version', type: 'varchar', length: 40, nullable: true })
  policyVersion: string | null;

  /** Where the consent action came from: 'signup', 'settings', 'api', ... */
  @Column({ type: 'varchar', length: 40, nullable: true })
  source: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true })
  ipAddress: string | null;
}
