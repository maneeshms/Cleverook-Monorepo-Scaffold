# Auth as a library (`@clevrook/auth`)

JWT auth ships as a **reusable, extensible library** (`libs/auth`): every project
gets the audit-approved base — register/login with constant-work compare and
progressive lockout, **rotating opaque SHA-256-hashed refresh tokens with reuse
detection**, stateless HS256 access tokens, hourly session purge — and extends it
through explicit seams instead of forking it.

## The split: library vs host

| The library owns                                        | The host app owns                                  |
| ------------------------------------------------------- | -------------------------------------------------- |
| Flows: register / login / refresh / logout / logout-all | The **users table + entity + module** (any schema) |
| `user_sessions` (rotation, reuse detection, purge cron) | The `AuthUserStore` adapter over its users service |
| JWT signing/validation (`JwtStrategy`, HS256 pinned)    | Secrets/TTLs/rounds via config (`forRootAsync`)    |
| Lockout + audit events (`logger.auditAuth`/`alert`)     | Side effects via hooks (welcome email, analytics…) |
| The `/auth` controller (register/login/refresh/logout)  | Optional replacement/extension of any of the above |

The library never imports a host feature module — it sees users only through the
`AUTH_USER_STORE` port (same inversion as messaging's `IN_APP_SINK` and
compliance's registries). Guards/decorators (`JwtAuthGuard`, `@Roles`,
`@Public()`, `@CurrentUser()`) stay in `@clevrook/common` and work unchanged.

## Wiring it (the reference in `apps/api/src/app.module.ts`)

```ts
AuthModule.forRootAsync({
  imports: [UsersModule], // exports the user store
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    accessSecret: config.get('jwt.accessSecret') ?? '',
    accessTtl: config.get('jwt.accessTtl'), // default '15m'
    refreshTtl: config.get('jwt.refreshTtl'), // default '30d'
    bcryptRounds: config.get('app.bcryptRounds'), // default 12
  }),
  userStore: UsersService, // implements AuthUserStore
  authService: AppAuthService, // optional subclass (see below)
});
```

Host prerequisites: run the `user_sessions` migration (rides with the auth
capability) and register `ScheduleModule.forRoot()` for the cleanup cron
(disable with `sessionCleanupCron: false` and drive `TokenService.purgeExpired()`
yourself).

### The user store contract

Implement `AuthUserStore` on your users service (the reference `UsersService`
already does): `findByEmail(email, withPassword?)`, `findById`, `create`,
`recordSuccessfulLogin`, `recordFailedLogin(user, maxAttempts)`, `isLocked`.
Your user entity just needs the fields in `AuthUserRecord` (id, email,
passwordHash, role, displayName, lockout counters) — everything else about your
user schema is yours.

## Extending it (the whole point)

**1. Side-effect hooks — subclass `AuthService`** (the reference:
`apps/api/src/modules/auth/app-auth.service.ts` sends the welcome email):

```ts
@Injectable()
export class AppAuthService extends AuthService {
  protected override async onRegistered(user: AuthUserRecord, ctx: RequestContext) {
    // welcome email / analytics / default workspace — best-effort by design:
    // a throwing hook is logged, never fails the signup.
  }
  protected override async onLoggedIn(user: AuthUserRecord, ctx: RequestContext) {}
}
// wire: AuthModule.forRootAsync({ ..., authService: AppAuthService })
```

**2. Custom JWT claims — subclass `TokenService`** and override
`buildAccessPayload` (keep claims non-sensitive):

```ts
export class TenantTokenService extends TokenService {
  protected override buildAccessPayload(user: AuthUserRecord, sessionId: string) {
    return { ...super.buildAccessPayload(user, sessionId), tenantId: user.tenantId };
  }
}
// wire: providers: [{ provide: TokenService, useClass: TenantTokenService }]
```

**3. Custom HTTP surface** — `controller: false`, then subclass the exported
`AuthController` (routes/decorators are inherited per method) or write your own
over `AuthService`.

**4. Extra registration fields** — extend `RegisterDto` in your controller
subclass; pass extras to your store's `create` via an overridden `register`.

### What you may NOT change (security invariants)

Subclassing gives you power — the base guarantees still apply
(`docs/agents/security.md` §2 + the auth recipe): never weaken TTLs, bcrypt ≥12,
the constant-work dummy compare, rotation + family-revoke reuse detection,
lockout thresholds, `algorithms: ['HS256']` pinning, or the audit events. A
subclass that overrides `register`/`login` keeps every one of those or it's a
finding, not a customisation.

## Generated projects

The `auth` capability (`--with-auth`, default-on) carries `libs/auth`, the app's
`AppAuthService` + users module, and the `InitUsersAndSessions` migration.
`--minimal` without auth prunes all of it. This library is TypeORM-coupled, like
messaging/compliance.

See also: [`docs/agents/security.md`](agents/security.md) (the ruleset),
[`docs/agents/recipes.md`](agents/recipes.md) ("Touching auth" protocol).
