import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { IsNull, LessThan, Repository } from 'typeorm';
import { parseDurationMs } from '@clevrook/common';
import { AlertSeverity, LoggerService } from '@clevrook/logger';
import { UserSession } from '../entities/user-session.entity';
import { AUTH_OPTIONS, AUTH_DEFAULTS, AuthModuleOptions } from '../auth.options';
import {
  AUTH_USER_STORE,
  AuthUserRecord,
  AuthUserStore,
} from '../interfaces/auth-user-store.interface';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
  sessionId: string;
  /** Subclasses may add claims via buildAccessPayload — keep them non-sensitive. */
  [claim: string]: unknown;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface SessionContext {
  userAgent?: string | null;
  ipAddress?: string | null;
}

/**
 * Session + token mechanics: opaque SHA-256-hashed rotating refresh tokens with
 * reuse detection (audit-approved — see docs/agents/security.md §2; never weaken).
 *
 * Extension points for host subclasses (swap in via standard Nest DI —
 * `{ provide: TokenService, useClass: MyTokenService }`):
 *   - `buildAccessPayload` to add custom (non-sensitive) JWT claims;
 *   - `refreshExpiryDate` / `generateRefreshToken` for policy tweaks.
 */
@Injectable()
export class TokenService {
  constructor(
    protected readonly jwt: JwtService,
    @Inject(AUTH_OPTIONS)
    protected readonly options: AuthModuleOptions,
    @InjectRepository(UserSession)
    protected readonly sessions: Repository<UserSession>,
    @Inject(AUTH_USER_STORE)
    protected readonly users: AuthUserStore,
    protected readonly logger: LoggerService,
  ) {}

  protected hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  protected generateRefreshToken(): string {
    // Opaque, high-entropy. Not a JWT — it's only ever compared by hash.
    return randomBytes(48).toString('base64url');
  }

  protected get accessTtl(): string {
    return this.options.accessTtl ?? AUTH_DEFAULTS.accessTtl;
  }

  /** Override to add custom claims. Never include secrets or PII beyond email. */
  protected buildAccessPayload(user: AuthUserRecord, sessionId: string): AccessTokenPayload {
    return { sub: user.id, email: user.email, role: user.role, sessionId };
  }

  protected signAccessToken(user: AuthUserRecord, sessionId: string): string {
    return this.jwt.sign(this.buildAccessPayload(user, sessionId), {
      secret: this.options.accessSecret,
      // jsonwebtoken's types (via @nestjs/jwt 11) narrow expiresIn to
      // `number | ms.StringValue`; our TTL comes from options as a plain string.
      expiresIn: this.accessTtl as JwtSignOptions['expiresIn'],
    });
  }

  protected refreshExpiryDate(): Date {
    // Mirror the refresh TTL (default 30d) for the DB session row. parseDurationMs
    // honours the unit, so '12h' is 12 hours — not 12 days.
    return new Date(
      Date.now() +
        parseDurationMs(this.options.refreshTtl ?? AUTH_DEFAULTS.refreshTtl, 30 * 86_400_000),
    );
  }

  /** Create a brand-new session (login / register) and return the token pair. */
  async issueForNewSession(user: AuthUserRecord, ctx: SessionContext = {}): Promise<TokenPair> {
    const refreshToken = this.generateRefreshToken();
    const session = await this.sessions.save(
      this.sessions.create({
        userId: user.id,
        refreshTokenHash: this.hash(refreshToken),
        userAgent: ctx.userAgent ?? null,
        ipAddress: ctx.ipAddress ?? null,
        expiresAt: this.refreshExpiryDate(),
        lastUsedAt: new Date(),
      }),
    );

    return {
      accessToken: this.signAccessToken(user, session.id),
      refreshToken,
      expiresIn: this.accessTtl,
    };
  }

  /**
   * Rotate a refresh token.
   *
   * The presented token is matched by hash against a session row — including
   * already-revoked rows, which is what makes reuse detection possible. Rotation
   * revokes the current row and writes a NEW row, so each old token hash stays on
   * record. If a token that maps to an already-revoked row is presented again, it
   * is a replayed/stolen token: we revoke EVERY session for that user, so theft is
   * self-defeating the moment either party reuses a rotated token.
   */
  async refreshSession(presentedToken: string, ctx: SessionContext = {}): Promise<TokenPair> {
    const presentedHash = this.hash(presentedToken);

    const session = await this.sessions.findOne({
      where: { refreshTokenHash: presentedHash },
      order: { createdAt: 'DESC' },
    });

    // Unknown token — never issued, or its row was purged.
    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Known but already revoked — this is reuse of a rotated token. Revoke all.
    if (session.revokedAt) {
      await this.revokeAllForUser(session.userId);
      this.logger.alertSecurity(
        'Refresh token reuse detected — all sessions revoked',
        AlertSeverity.CRITICAL,
        { userId: session.userId, sessionId: session.id },
      );
      throw new UnauthorizedException('Refresh token reuse detected; all sessions revoked');
    }

    if (session.expiresAt.getTime() < Date.now()) {
      await this.sessions.update(session.id, { revokedAt: new Date() });
      throw new UnauthorizedException('Session expired');
    }

    // The session row carries only userId — resolve the user through the host's
    // store (no entity relation; the user may have been deleted meanwhile).
    const user = await this.users.findById(session.userId);
    if (!user) {
      await this.sessions.update(session.id, { revokedAt: new Date() });
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Revoke the presented session and chain a fresh one (keeps the audit trail).
    await this.sessions.update(session.id, { revokedAt: new Date() });

    const newToken = this.generateRefreshToken();
    const newSession = await this.sessions.save(
      this.sessions.create({
        userId: session.userId,
        refreshTokenHash: this.hash(newToken),
        userAgent: ctx.userAgent ?? session.userAgent ?? null,
        ipAddress: ctx.ipAddress ?? session.ipAddress ?? null,
        expiresAt: this.refreshExpiryDate(),
        lastUsedAt: new Date(),
      }),
    );

    return {
      accessToken: this.signAccessToken(user, newSession.id),
      refreshToken: newToken,
      expiresIn: this.accessTtl,
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.sessions.update(sessionId, { revokedAt: new Date() });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.sessions.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  /** All session rows for a user — for GDPR export / "my devices" style views. */
  listSessionsForUser(userId: string): Promise<UserSession[]> {
    return this.sessions.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  /** Housekeeping: purge expired sessions (wired to the hourly cleanup cron). */
  async purgeExpired(): Promise<void> {
    await this.sessions.delete({ expiresAt: LessThan(new Date()) });
  }
}
