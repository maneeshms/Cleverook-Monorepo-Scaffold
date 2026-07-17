import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@clevrook/database';

/**
 * One row per active login session. Holds the HASH of the current refresh token,
 * never the token itself. Rotation replaces the hash on each refresh; presenting
 * a stale (already-rotated) token signals theft and triggers revocation.
 *
 * `userId` is a plain column (the FK lives in the host's migration) — the
 * library deliberately has no entity relation to the host's User class, which is
 * what keeps it portable across user schemas.
 */
@Entity('user_sessions')
export class UserSession extends BaseEntity {
  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

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
