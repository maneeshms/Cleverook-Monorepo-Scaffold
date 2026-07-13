import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { IsNull, LessThan, Repository } from 'typeorm';
import { parseDurationMs } from '@clevscaffold/common';
import { AlertSeverity, LoggerService } from '@clevscaffold/logger';
import { User } from '../../users/entities/user.entity';
import { UserSession } from '../entities/user-session.entity';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
  sessionId: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

interface SessionContext {
  userAgent?: string | null;
  ipAddress?: string | null;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(UserSession)
    private readonly sessions: Repository<UserSession>,
    private readonly logger: LoggerService,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private generateRefreshToken(): string {
    // Opaque, high-entropy. Not a JWT — it's only ever compared by hash.
    return randomBytes(48).toString('base64url');
  }

  private signAccessToken(user: User, sessionId: string): string {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId,
    };
    return this.jwt.sign(payload, {
      secret: this.config.get<string>('jwt.accessSecret'),
      // jsonwebtoken's types (via @nestjs/jwt 11) narrow expiresIn to
      // `number | ms.StringValue`; our TTL comes from config as a plain string.
      expiresIn: (this.config.get<string>('jwt.accessTtl') ?? '15m') as JwtSignOptions['expiresIn'],
    });
  }

  private refreshExpiryDate(): Date {
    // Mirror JWT_REFRESH_TTL (default 30d) for the DB session row. parseDurationMs
    // honours the unit, so '12h' is 12 hours — not 12 days.
    const ttl = this.config.get<string>('jwt.refreshTtl');
    return new Date(Date.now() + parseDurationMs(ttl, 30 * 86_400_000));
  }

  /** Create a brand-new session (login / register) and return the token pair. */
  async issueForNewSession(user: User, ctx: SessionContext = {}): Promise<TokenPair> {
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
      expiresIn: this.config.get<string>('jwt.accessTtl') ?? '15m',
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
      relations: { user: true },
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
      accessToken: this.signAccessToken(session.user, newSession.id),
      refreshToken: newToken,
      expiresIn: this.config.get<string>('jwt.accessTtl') ?? '15m',
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.sessions.update(sessionId, { revokedAt: new Date() });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.sessions.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  /** Housekeeping: purge expired/revoked sessions. Wire to a scheduled job later. */
  async purgeExpired(): Promise<void> {
    await this.sessions.delete({ expiresAt: LessThan(new Date()) });
  }
}
