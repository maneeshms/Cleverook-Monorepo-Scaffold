import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Append-only, tamper-evident audit trail (SOC 2 CC7.2/CC7.3).
 *
 * Deliberately NOT a {@link BaseEntity}: audit rows are immutable — no
 * `updated_at`, no soft delete. Each row is chained to the previous one by an
 * HMAC hash (`hash = HMAC(secret, prevHash | canonical(payload))`), so any
 * insert, edit, delete, or re-ordering after the fact breaks the chain and is
 * detectable via `AuditService.verifyChain()`. The HMAC key lives only in the
 * environment, so even an actor with write access to this table cannot forge a
 * valid continuation.
 *
 * Rows are written through {@link AuditService.record} only — never updated.
 * Retention is enforced by the RetentionService (storage-limitation), which is
 * itself the one exception allowed to delete aged rows (and audits doing so).
 */
@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Monotonic sequence — the chain order, independent of clock skew. */
  @Index()
  @Column({ type: 'bigint', generated: 'increment' })
  sequence: string;

  @CreateDateColumn({ name: 'recorded_at', type: 'timestamptz' })
  recordedAt: Date;

  /** Who acted. Null for anonymous/unauthenticated events (e.g. failed login). */
  @Index()
  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  /** 'user' | 'system' | 'service' — what kind of principal acted. */
  @Column({ name: 'actor_type', type: 'varchar', length: 32, default: 'user' })
  actorType: string;

  /** Machine action code, e.g. 'user.profile.update', 'auth.login', 'data.erase'. */
  @Index()
  @Column({ type: 'varchar', length: 100 })
  action: string;

  /** The kind of resource acted on, e.g. 'user', 'task'. Null for non-resource events. */
  @Column({ name: 'resource_type', type: 'varchar', length: 64, nullable: true })
  resourceType: string | null;

  @Column({ name: 'resource_id', type: 'varchar', length: 128, nullable: true })
  resourceId: string | null;

  /** 'success' | 'failure' | 'denied'. */
  @Column({ type: 'varchar', length: 16, default: 'success' })
  outcome: string;

  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent: string | null;

  @Column({ name: 'request_id', type: 'varchar', length: 128, nullable: true })
  requestId: string | null;

  /** Structured context — never store secrets or raw PII values here. */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  /** Hash of the previous row (empty string for the genesis row). */
  @Column({ name: 'prev_hash', type: 'varchar', length: 64, default: '' })
  prevHash: string;

  /** HMAC-SHA256 over (prevHash | canonical payload). Verifiable, unforgeable. */
  @Column({ type: 'varchar', length: 64 })
  hash: string;
}
