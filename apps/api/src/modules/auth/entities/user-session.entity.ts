import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@clevscaffold/database';
import { User } from '../../users/entities/user.entity';

/**
 * One row per active login session. Holds the HASH of the current refresh token,
 * never the token itself. Rotation replaces the hash on each refresh; presenting
 * a stale (already-rotated) token signals theft and triggers revocation.
 *
 * This is the Postgres-backed implementation. To move to Redis later, implement
 * the same operations behind a SessionStore interface — the AuthService contract
 * doesn't change.
 */
@Entity('user_sessions')
export class UserSession extends BaseEntity {
  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, (user) => user.sessions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // SHA-256 of the refresh token. Lookups are by this hash.
  @Index()
  @Column({ name: 'refresh_token_hash', type: 'varchar', length: 64 })
  refreshTokenHash: string;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  // Set when the session is explicitly logged out or revoked by reuse detection.
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}
