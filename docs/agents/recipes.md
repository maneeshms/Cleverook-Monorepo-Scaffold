# Recipes — step-by-step for the common tasks

Multi-step tasks are where instructions get dropped. Follow the matching recipe
top-to-bottom; each ends with **Done when** — the task is not finished until every
line holds. If a step can't be followed, stop and say why in the PR/response
instead of skipping it silently. **If no recipe fits your task, that is a
stop-and-ask (AGENTS.md), not a licence to improvise** — describe the task, the
gap, and your proposed steps, and wait for a human call.

Shared final gate for every recipe: `npm run verify` (format:check + lint +
typecheck + build + unit, coverage ≥90%) and, for anything behavioural,
`npm run e2e`.

---

## Add a feature module (TypeORM app)

1. Create `apps/api/src/modules/<name>/` mirroring `modules/tasks` exactly:
   `dto/`, `entities/`, controller + service + module + co-located `*.spec.ts`.
2. Entity extends `BaseEntity`; register with `TypeOrmModule.forFeature([X])`.
3. Write the migration (see recipe below) — the entity alone changes nothing.
4. DTOs per action, validated + Swagger-decorated; list DTO extends
   `PaginationQueryDto`; responses use `paginate()`.
5. Service: ownership checks on every read/write (BOLA-safe 404 — `nestjs.md` §3).
6. Register the module in `app.module.ts` — own line, outside all
   `clevscaffold:*` sentinel blocks.
7. Specs for service **and** controller: happy path + every thrown branch +
   authorization branches.
8. Endpoints touching auth/data? Extend `apps/api/test/security-owasp.e2e-spec.ts`.
9. Module stores personal data? Register it for GDPR export/erasure — follow
   "Register a module's personal data" below.

**Done when:** `npm run verify` green · `npm run e2e` green · every endpoint has
Swagger + a test · ownership enforced in the service · migration applied cleanly
on a fresh DB (`npm run e2e:setup` proves this) · personal data registered
(export + erasure) if the module stores any.

## Add an endpoint to an existing module

1. DTO first (new file in `dto/`), validated + bounded (`@MaxLength`, capped
   numbers). No privileged fields.
2. Service method with the logic + ownership check. Controller method that only
   delegates (`@CurrentUser()` for identity, `ParseUUIDPipe` for id params).
3. `@ApiOperation` summary; `@HttpCode` if not the default.
4. Unit tests: service branches + controller delegation. Sensitive route → OWASP
   e2e case too.

**Done when:** verify + e2e green · the new route appears in Swagger · a request
with an unknown field is rejected (whitelist working) · a foreign user gets 404,
not 403.

## Write a TypeORM migration

1. Hand-write `libs/database/src/migrations/<timestamp>-<Name>.ts` — next
   timestamp after the latest existing one. No generators against a live DB.
2. Enums: `DO $$ BEGIN CREATE TYPE … EXCEPTION WHEN duplicate_object THEN null; END $$;`
   (Postgres has no `CREATE TYPE IF NOT EXISTS`).
3. Index every column your queries will filter/join on. FKs get `ON DELETE`
   behavior chosen deliberately.
4. Implement `down()` for real (drop what `up()` made, reverse order).
5. Expand/contract for zero-downtime: additive first; destructive parts ship in a
   later migration after code stops using them.
6. Apply: `npm run migration:run`, then `npm run e2e:setup && npm run e2e` (e2e
   runs the full migration chain from scratch — this catches ordering bugs).

**Done when:** fresh-DB migrate passes (e2e:setup) · `down()` reverses `up()` ·
hot columns indexed.

## Change the Prisma schema

1. Edit `apps/api-prisma/prisma/schema.prisma` (`PascalCase` model, `@@map` to
   snake_case; **no `url` in the datasource** — Prisma 7 reads it from
   `prisma.config.ts`).
2. `npm run prisma:migrate` (dev) — commit the generated migration directory.
3. `npm run prisma:generate`, then fix type fallout.
4. Update `prisma/seed.ts` if the model participates in seeding.

**Done when:** verify green · e2e green (`clevscaffold_prisma_test` migrates from
scratch) · migration directory committed.

## Add a config key

1. Decide: secret or not? **Secret** → `.env.example` (placeholder + comment)
   only. **Non-secret** → the app's `config/default.json` (+ env-specific
   overrides where they differ).
2. Add the validation rule to `libs/config` (`EnvironmentVariables` — optional
   with sane default unless the app truly can't boot without it; app-required
   keys go in that app's `createEnvValidator({ require })`).
3. Expose through the matching `registerAs` namespace (or add one) and read via
   `this.config.get<T>('ns.key')` — never `process.env`.
4. Test the validation rule (see `libs/config/src/env.validation.spec.ts`).

**Done when:** boot fails fast with a clear message on invalid value · key
documented in `.env.example` or JSON · no direct `process.env` reads added.

## Add a dependency

1. Add to the `package.json` of the package that imports it (`apps/<x>/` or
   `libs/<x>/`) — **never the root** (root is tooling only). Exact version, no
   `^`/`~` (`.npmrc save-exact` handles `npm install <pkg>`).
2. `npm install` at the root to update the single lockfile. Frontends: install
   inside `apps/web*` (own lockfile).
3. Licence/size sanity: prefer zero-dep libs; no abandoned packages.

**Done when:** exact pin in the right package.json · lockfile committed in the
same change · `npm run verify` green (docker-manifest stays correct automatically).

## Send something (email / in-app) from a feature

1. Inject `MessagingService`; call `dispatch({ type: MessageType.X, userId, payload })`
   — see `TasksService.notifyAssignment`.
2. Template/routing live in `libs/messaging` config, not inline strings in the
   feature service.
3. Never block correctness on delivery: messaging failures are logged, not thrown
   through the user's request (unless delivery IS the feature).
4. Unit test asserts `dispatch` was called with the right type/payload — mock the
   service; never send in tests.

## Gate a feature behind a flag

1. Inject `FeatureFlagsService`; branch on `await flags.isEnabled('my_flag')`.
2. Flag keys are `snake_case`, stable, and documented where used. Default
   behavior (flag off / provider down) must be the safe path.
3. Unit test both branches.

## Register a module's personal data (GDPR export/erasure/retention)

Any module that stores user-attributable data must be reachable by GDPR export
**and** erasure, or both silently become incomplete. Rules:
`docs/agents/compliance.md`.

1. Open `apps/api/src/modules/compliance/compliance-wiring.service.ts` and add a
   `register<Thing>()` method mirroring `registerTasks()`: a
   `PersonalDataContributor` with a stable `key`, a `collect(userId)` that
   returns everything the subject could claim, and an `erase(userId)` that
   really removes/anonymises it (returns the affected count).
2. Decide the erasure semantics deliberately (see the existing contributors):
   subject-owned rows → delete; rows owned by others that reference the subject
   → detach (null the FK); rows that must survive for FK integrity → anonymise
   to a tombstone (`erased-<id>@erased.invalid` pattern).
3. Data that ages out? Also register a `RetentionTarget` (`key`,
   `windowDays: (p) => p.<window>`, idempotent `purge(olderThan)`); if it needs a
   new window, add it to `DEFAULT_RETENTION` + `complianceConfig` + validation +
   `.env.example` (config-key recipe applies).
4. Inject the new repository via the wiring module's `TypeOrmModule.forFeature`.
   If the feature is an optional capability, wrap every added line in its
   `clevscaffold:<token>` sentinels (see the tasks/messaging blocks).
5. Extend `compliance-wiring.service.spec.ts`: collect returns the data, erase
   removes it, purge is idempotent.

**Done when:** verify green · `GET /privacy/export` includes the new key ·
`POST /privacy/erase` leaves no PII behind for it · retention purge (if any)
tested idempotent · sentinels balanced.

## Audit a sensitive mutation

For role/credential changes, destructive admin ops, privacy actions — anything
an auditor would ask "who did that, when?".

1. Inject `AuditService` (`@clevrook/compliance`); after the mutation succeeds,
   call `record({ action, actorId, resourceType, resourceId, outcome, metadata })`.
2. `action` is dotted-lowercase (`user.role.update`); `metadata` holds ids,
   counts, and field **names** — never raw PII values, tokens, or secrets.
3. `record()` never throws to the caller — don't wrap it in response-altering
   try/catch, and never block the mutation on it.
4. Unit test asserts `record` was called with the right action/actor (mock the
   service).

**Done when:** verify green · the event appears in `audit_log` on a live run ·
`GET /admin/audit/verify` still returns `ok: true` · no PII in metadata.

## Touching auth / tokens / sessions (special protocol)

The auth design (rotating hashed refresh + reuse detection + lockout) is
audit-approved and lives in **`libs/auth`** (`@clevrook/auth`); apps extend it
via subclass hooks (`docs/AUTH.md`) — app-level customisation belongs in the
host's `AuthService` subclass, base changes in the lib. A stricter loop applies:

1. Read `docs/agents/security.md` §2 and `docs/AUTH.md` **before** editing.
2. Never weaken: token TTLs, hashing (SHA-256 for refresh, bcrypt ≥12), reuse
   detection → family revoke, lockout thresholds, the constant-work dummy hash,
   `algorithms: ['HS256']` pinning.
3. Every change extends `security-owasp.e2e-spec.ts` and keeps
   `npm run scan:security` at its passing baseline against a local serve.
4. Both apps (`api`, `api-prisma`) stay behaviorally in sync for shared auth
   surface.

**Done when:** OWASP e2e green · scanner baseline intact · audit events
(`logger.audit`) still emitted for register/login/logout/lockout/reuse.
