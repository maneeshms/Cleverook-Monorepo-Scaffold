import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AlertSeverity, AuditAction, AuditStatus, LoggerService } from '@clevrook/logger';
import { TokenPair, TokenService, SessionContext } from './token.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { AUTH_OPTIONS, AUTH_DEFAULTS, AuthModuleOptions } from '../auth.options';
import {
  AUTH_USER_STORE,
  AuthUserRecord,
  AuthUserStore,
} from '../interfaces/auth-user-store.interface';

export type RequestContext = SessionContext;

/**
 * The base auth flow: register / login (constant-work + progressive lockout) /
 * refresh (rotation + reuse detection) / logout. Ships working out of the box;
 * hosts extend by subclassing and passing the subclass via
 * `AuthModule.forRootAsync({ authService: MyAuthService })`.
 *
 * Extension points (all `protected`):
 *   - `onRegistered(user, ctx)` — post-signup side effects (welcome email,
 *     analytics, default workspace…). Base is a no-op; NEVER let it throw the
 *     signup away — best-effort belongs inside the hook.
 *   - `onLoggedIn(user, ctx)` — post-login side effects.
 *   - `hashPassword` / the whole `register`/`login` methods when a flow truly
 *     differs (keep the security invariants: constant-work compare, lockout,
 *     audit events).
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_USER_STORE)
    protected readonly users: AuthUserStore,
    protected readonly tokens: TokenService,
    @Inject(AUTH_OPTIONS)
    protected readonly options: AuthModuleOptions,
    protected readonly logger: LoggerService,
  ) {}

  protected async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.options.bcryptRounds ?? AUTH_DEFAULTS.bcryptRounds);
  }

  /** Post-registration hook — override for side effects. Base: no-op. */
  protected async onRegistered(_user: AuthUserRecord, _ctx: RequestContext): Promise<void> {
    // intentionally empty
  }

  /** Post-login hook — override for side effects. Base: no-op. */
  protected async onLoggedIn(_user: AuthUserRecord, _ctx: RequestContext): Promise<void> {
    // intentionally empty
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

    // Side effects are best-effort — a failing hook must never undo a signup.
    await this.onRegistered(user, ctx).catch((err) =>
      this.logger.error(`onRegistered hook failed: ${(err as Error).message}`, undefined, 'Auth'),
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
      await this.users.recordFailedLogin(
        user,
        this.options.maxLoginAttempts ?? AUTH_DEFAULTS.maxLoginAttempts,
      );
      this.logger.auditAuth(AuditAction.LOGIN, AuditStatus.FAILURE, user.id, {
        reason: 'bad_password',
        ipAddress: ctx.ipAddress,
      });
      if (this.users.isLocked(user)) {
        this.logger.alertSecurity(
          'Account locked after repeated failed logins',
          AlertSeverity.WARNING,
          {
            userId: user.id,
            ipAddress: ctx.ipAddress,
          },
        );
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.users.recordSuccessfulLogin(user.id);
    this.logger.auditAuth(AuditAction.LOGIN, AuditStatus.SUCCESS, user.id, {
      ipAddress: ctx.ipAddress,
    });

    await this.onLoggedIn(user, ctx).catch((err) =>
      this.logger.error(`onLoggedIn hook failed: ${(err as Error).message}`, undefined, 'Auth'),
    );

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
