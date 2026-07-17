import type { InjectionToken, ModuleMetadata, Type } from '@nestjs/common';
import type { AuthService } from './services/auth.service';
import type { AuthUserStore } from './interfaces/auth-user-store.interface';

/**
 * Runtime configuration for the auth library. The host app builds this from its
 * ConfigService and passes it via `AuthModule.forRootAsync(...)`. The library
 * never reads `process.env` itself — that's what keeps it portable across apps
 * and projects.
 */
export interface AuthModuleOptions {
  /** HS256 secret for access tokens. REQUIRED, ≥32 chars (validate at the host). */
  accessSecret: string;
  /** Access-token TTL (ms-style string, e.g. '15m'). Default '15m'. */
  accessTtl?: string;
  /** Refresh-token/session TTL (e.g. '30d'). Default '30d'. */
  refreshTtl?: string;
  /** bcrypt cost factor. Default 12 — never go below. */
  bcryptRounds?: number;
  /** Failed logins before progressive lockout kicks in. Default 5. */
  maxLoginAttempts?: number;
  /** Run the hourly expired-session purge cron. Default true. */
  sessionCleanupCron?: boolean;
}

/** DI token for the resolved {@link AuthModuleOptions}. */
export const AUTH_OPTIONS = 'AUTH_OPTIONS';

/** Defaults applied when the host omits an option. */
export const AUTH_DEFAULTS = {
  accessTtl: '15m',
  refreshTtl: '30d',
  bcryptRounds: 12,
  maxLoginAttempts: 5,
} as const;

/** Async registration shape for {@link AuthModule.forRootAsync}. */
export interface AuthModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  /** Providers to inject into `useFactory` (e.g. ConfigService). */
  inject?: InjectionToken[];
  /** Builds the runtime options — usually from the host's ConfigService. */
  useFactory: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- standard Nest forRootAsync factory signature
    ...args: any[]
  ) => AuthModuleOptions | Promise<AuthModuleOptions>;
  /**
   * The host's user store — an injectable (exported by a module in `imports`)
   * implementing {@link AuthUserStore}. The library owns sessions and token
   * mechanics; the HOST owns the users table and its schema.
   */
  userStore: Type<AuthUserStore> | InjectionToken;
  /**
   * Extension point: a host subclass of {@link AuthService} to swap in (override
   * the protected hooks — onRegistered/onLoggedIn — or whole flows). The base
   * class is used when omitted.
   */
  authService?: Type<AuthService>;
  /**
   * Register the built-in `/auth` controller (register/login/refresh/logout).
   * Default true. Set false to expose your own controller over the services —
   * subclassing the exported `AuthController` inherits all routes.
   */
  controller?: boolean;
}
