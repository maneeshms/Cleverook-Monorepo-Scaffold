/**
 * The user contract the auth library needs — nothing more. The host app owns
 * the users table/entity/module and adapts it to this port (the reference
 * `UsersService` in apps/api implements it as-is). This inversion is what lets
 * the library ship working auth without importing any host feature module,
 * and lets every project keep full control of its user schema.
 */
export interface AuthUserRecord {
  id: string;
  email: string;
  /** Only populated when fetched with `withPassword` (login path). */
  passwordHash?: string | null;
  displayName?: string | null;
  role: string;
  failedLoginAttempts: number;
  lockedUntil?: Date | null;
}

export interface CreateAuthUserData {
  email: string;
  passwordHash: string;
  displayName?: string | null;
}

export interface AuthUserStore {
  /** `withPassword` must add the (normally deselected) password hash. */
  findByEmail(email: string, withPassword?: boolean): Promise<AuthUserRecord | null>;
  findById(id: string): Promise<AuthUserRecord | null>;
  /** Called by register(). Reject duplicates at the DB level (unique email). */
  create(data: CreateAuthUserData): Promise<AuthUserRecord>;
  /** Reset lockout counters + stamp last login. */
  recordSuccessfulLogin(id: string): Promise<void>;
  /** Increment counters and apply progressive lockout at `maxAttempts`. */
  recordFailedLogin(user: AuthUserRecord, maxAttempts: number): Promise<void>;
  isLocked(user: AuthUserRecord): boolean;
}

/** DI token under which the host's store is provided. */
export const AUTH_USER_STORE = 'AUTH_USER_STORE';
