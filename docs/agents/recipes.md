# Recipes — step-by-step for the common tasks

Multi-step tasks are where instructions get dropped. Follow the matching recipe
top-to-bottom; each ends with **Done when** — the task is not finished until every
line holds. If a step can't be followed, stop and say why in the PR/response
instead of skipping it silently.

Shared final gate for every recipe: `npm run verify` (lint + typecheck + build +
unit, coverage ≥90%) and, for anything behavioural, `npm run e2e`.

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

**Done when:** `npm run verify` green · `npm run e2e` green · every endpoint has
Swagger + a test · ownership enforced in the service · migration applied cleanly
on a fresh DB (`npm run e2e:setup` proves this).

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

## Touching auth / tokens / sessions (special protocol)

The auth design (rotating hashed refresh + reuse detection + lockout) is
audit-approved. Changes here follow a stricter loop:

1. Read `docs/agents/security.md` §2 **before** editing.
2. Never weaken: token TTLs, hashing (SHA-256 for refresh, bcrypt ≥12), reuse
   detection → family revoke, lockout thresholds, the constant-work dummy hash,
   `algorithms: ['HS256']` pinning.
3. Every change extends `security-owasp.e2e-spec.ts` and keeps
   `npm run scan:security` at its passing baseline against a local serve.
4. Both apps (`api`, `api-prisma`) stay behaviorally in sync for shared auth
   surface.

**Done when:** OWASP e2e green · scanner baseline intact · audit events
(`logger.audit`) still emitted for register/login/logout/lockout/reuse.
