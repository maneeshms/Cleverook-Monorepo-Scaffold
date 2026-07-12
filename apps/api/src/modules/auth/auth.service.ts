import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { AlertSeverity, AuditAction, AuditStatus, LoggerService } from '@clevscaffold/logger';
import { MessagingService, MessageType } from '@clevscaffold/messaging';
import { UsersService } from '../users/users.service';
import { TokenPair, TokenService } from './services/token.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

interface RequestContext {
  userAgent?: string | null;
  ipAddress?: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
    private readonly messaging: MessagingService,
  ) {}

  private async hashPassword(plain: string): Promise<string> {
    const rounds = this.config.get<number>('app.bcryptRounds') ?? 12;
    return bcrypt.hash(plain, rounds);
  }

  async register(dto: RegisterDto, ctx: RequestContext = {}): Promise<TokenPair> {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await this.hashPassword(dto.password);
    const user = await this.users.create({
      email: dto.email,
      passwordHash,
      displayName: dto.displayName ?? null,
    });

    this.logger.auditAuth(AuditAction.REGISTER, AuditStatus.SUCCESS, user.id, {
      ipAddress: ctx.ipAddress,
    });

    // Welcome email through the messaging engine — best-effort, never blocks
    // signup. Without a Resend key this lands on the console-email provider.
    this.messaging
      .dispatch({
        messageType: MessageType.WELCOME,
        userId: user.id,
        recipient: { email: user.email },
        variables: {
          displayName: user.displayName ?? '',
          displayNameComma: user.displayName ? `, ${user.displayName}!` : '!',
          link: this.config.get<string>('messaging.appPublicUrl') ?? '',
        },
      })
      .catch((err) =>
        this.logger.error(`Welcome email dispatch failed: ${err.message}`, undefined, 'Auth'),
      );

    return this.tokens.issueForNewSession(user, ctx);
  }

  async login(dto: LoginDto, ctx: RequestContext = {}): Promise<TokenPair> {
    const user = await this.users.findByEmail(dto.email, true);

    // Constant-work response for unknown users: burn a bcrypt compare against a
    // dummy hash so timing doesn't reveal whether the email exists.
    const dummyHash = '$2b$12$0000000000000000000000000000000000000000000000000000';
    if (!user || !user.passwordHash) {
      await bcrypt.compare(dto.password, dummyHash).catch(() => false);
      this.logger.auditAuth(AuditAction.LOGIN, AuditStatus.FAILURE, undefined, {
        reason: 'unknown_user',
        ipAddress: ctx.ipAddress,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (this.users.isLocked(user)) {
      this.logger.auditAuth(AuditAction.LOGIN, AuditStatus.FAILURE, user.id, {
        reason: 'account_locked',
        ipAddress: ctx.ipAddress,
      });
      throw new UnauthorizedException(
        'Account temporarily locked after repeated failed logins. Try again later.',
      );
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      await this.users.recordFailedLogin(user);
      this.logger.auditAuth(AuditAction.LOGIN, AuditStatus.FAILURE, user.id, {
        reason: 'bad_password',
        ipAddress: ctx.ipAddress,
      });
      if (this.users.isLocked(user)) {
        this.logger.alertSecurity('Account locked after repeated failed logins', AlertSeverity.WARNING, {
          userId: user.id,
          ipAddress: ctx.ipAddress,
        });
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.users.recordSuccessfulLogin(user.id);
    this.logger.auditAuth(AuditAction.LOGIN, AuditStatus.SUCCESS, user.id, {
      ipAddress: ctx.ipAddress,
    });
    return this.tokens.issueForNewSession(user, ctx);
  }

  async refresh(refreshToken: string, ctx: RequestContext = {}): Promise<TokenPair> {
    return this.tokens.refreshSession(refreshToken, ctx);
  }

  async logout(sessionId: string, userId?: string): Promise<void> {
    await this.tokens.revokeSession(sessionId);
    this.logger.auditAuth(AuditAction.LOGOUT, AuditStatus.SUCCESS, userId);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.tokens.revokeAllForUser(userId);
    this.logger.auditAuth(AuditAction.LOGOUT_ALL, AuditStatus.SUCCESS, userId);
  }
}
