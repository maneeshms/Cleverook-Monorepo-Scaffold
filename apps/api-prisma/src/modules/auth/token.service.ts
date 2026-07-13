import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { User } from '@prisma/client';
import { parseDurationMs } from '@clevscaffold/common';
import { AlertSeverity, LoggerService } from '@clevscaffold/logger';
import { PrismaService } from '../../prisma/prisma.service';

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

/**
 * Same session/rotation design as the TypeORM app (hashed opaque refresh
 * tokens, rotation, reuse detection) implemented on Prisma — proving the
 * security pattern is ORM-independent.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private generateRefreshToken(): string {
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
    const ttl = this.config.get<string>('jwt.refreshTtl');
    return new Date(Date.now() + parseDurationMs(ttl, 30 * 86_400_000));
  }

  async issueForNewSession(user: User, ctx: SessionContext = {}): Promise<TokenPair> {
    const refreshToken = this.generateRefreshToken();
    const session = await this.prisma.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: this.hash(refreshToken),
        userAgent: ctx.userAgent ?? null,
        ipAddress: ctx.ipAddress ?? null,
        expiresAt: this.refreshExpiryDate(),
        lastUsedAt: new Date(),
      },
    });

    return {
      accessToken: this.signAccessToken(user, session.id),
      refreshToken,
      expiresIn: this.config.get<string>('jwt.accessTtl') ?? '15m',
    };
  }

  async refreshSession(presentedToken: string, ctx: SessionContext = {}): Promise<TokenPair> {
    const session = await this.prisma.userSession.findFirst({
      where: { refreshTokenHash: this.hash(presentedToken) },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

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
      await this.prisma.userSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Session expired');
    }

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    const newToken = this.generateRefreshToken();
    const newSession = await this.prisma.userSession.create({
      data: {
        userId: session.userId,
        refreshTokenHash: this.hash(newToken),
        userAgent: ctx.userAgent ?? session.userAgent,
        ipAddress: ctx.ipAddress ?? session.ipAddress,
        expiresAt: this.refreshExpiryDate(),
        lastUsedAt: new Date(),
      },
    });

    return {
      accessToken: this.signAccessToken(session.user, newSession.id),
      refreshToken: newToken,
      expiresIn: this.config.get<string>('jwt.accessTtl') ?? '15m',
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
