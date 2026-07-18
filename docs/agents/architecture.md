# Architecture

How the pieces fit, the boundaries you must respect, and how to extend the repo.

## Layout & dependency direction

```
libs/common   (ORM-free)  ──imported by everything
libs/config   (loader + validation + typed namespaces)
libs/logger   (Winston: log + audit + alert)
libs/database (TypeORM only: DatabaseModule, data-source, BaseEntity, migrations)
libs/auth     (depends on common+database+logger; TypeORM-coupled; source-only lib)
libs/feature-flags(depends on common+database+logger; TypeORM-coupled; source-only lib)
libs/messaging(depends on database; TypeORM-coupled; source-only lib)
libs/realtime (depends on logger only; ORM-free socket.io channel; source-only lib)
libs/compliance(depends on common+database+logger; TypeORM-coupled; source-only lib)
apps/api           → common, config, logger, database, auth, feature-flags,
                     messaging, realtime, compliance               (TypeORM)
apps/web, web-next → standalone frontends (own package.json/lockfile)
apps/mobile        → standalone Expo React Native app (own package.json/lockfile,
                     no Docker — ships via EAS/app stores; see docs/MOBILE.md)
```

**Rules:**

- `libs/common` is **ORM-free** — no ORM imports — so any context can use it.
  `BaseEntity` lives in `libs/database` (not common) for the same reason.
- `libs/database`, `libs/auth`, `libs/feature-flags`, `libs/messaging`, and
  `libs/compliance` are **TypeORM-coupled** (`libs/realtime` is ORM-free but
  wired only in the API).
- `libs/auth`, `libs/feature-flags`, `libs/messaging`, `libs/realtime`, and
  `libs/compliance` have
  **no Nx build target** — they're source-only libs; consuming apps compile them.
  Adding a build target reintroduces the `rootDir` errors we removed. Keep them
  source-only.
- **Config-injected libs:** `auth`, `feature-flags`, `messaging`, `realtime`, and
  `compliance`
  read no env/app-config themselves — the host passes runtime options via
  `forRootAsync({ useFactory })` built from its ConfigService. That's what keeps
  them portable across projects.
- **Port pattern (auth):** `libs/auth` sees users only through its
  `AUTH_USER_STORE` port — the host's `UsersService` implements `AuthUserStore`
  and keeps full ownership of the users table/schema. Hosts extend flows by
  subclassing `AuthService`/`TokenService` (`docs/AUTH.md`), never by forking.
- **Registry pattern (compliance):** `libs/compliance` never imports feature
  modules. Features push themselves in at boot — the api's
  `modules/compliance/compliance-wiring.service.ts` registers each module's
  `PersonalDataContributor` / `RetentionTarget` on the runtime registries. Extend
  the wiring service; never add a feature import to the lib.
- **Apps never import other apps.** Shared code goes in a lib.
- Path aliases: `@clevrook/{common,config,logger,database,auth,feature-flags,messaging,realtime,compliance}`.

## Package layout (npm workspaces)

**Every project owns its own `package.json`** — there is no giant root dependency
list. The root is a thin workspace root (`"workspaces": ["libs/*", "apps/api"]`)
holding only shared build/test tooling (nx, typescript, eslint, prettier, jest,
husky) and orchestration scripts.

- **Each lib** (`libs/*/package.json`) declares exactly the npm deps its source
  imports, plus its `@clevrook/*` workspace deps.
- **Each backend app** declares its own deps + the workspace libs it uses. So
  `apps/api` lists its TypeORM/messaging deps directly.
- **One root lockfile** (`package-lock.json`) — npm workspaces hoists a single,
  deduplicated `node_modules`. That's deliberate: deterministic installs + one
  security-audit surface. Per-project _manifests_, single lockfile.
- **Frontends and mobile** (`apps/web`, `apps/web-next`, `apps/mobile`) are **not**
  workspaces — they keep their own `package.json` **and** lockfile and build/deploy
  fully standalone. In `apps/mobile`, `expo-*`/`react-native` keep Expo's `~`
  ranges (the SDK owns them; bump via `npx expo install`).
- Add a dep to the package that uses it (`libs/<x>/package.json` or
  `apps/<x>/package.json`), exact-pinned, then `npm install` at the root.

## Lean Docker images

Apps compile their libs into `dist` (tsc + tsc-alias), so at runtime only external
npm deps are needed. `scripts/docker-manifest.mjs` walks an app's package.json,
follows `@clevrook/*` into each lib, and flattens the external dependency
closure into a self-contained `package.json` in the app's `dist`. The Docker
runtime stage `npm install --omit=dev` from that — so `apps/api` images ship
only TypeORM/BullMQ/OpenFeature and the libs it actually imports. Keep app/lib
deps accurate and this stays correct automatically.

## Layered configuration (`libs/config`)

Per key, first hit wins:

```
1. process.env                 (host / .env / Railway)   ← always wins
2. config/{NODE_ENV}.json      (per-app, per-env)
3. config/default.json         (per-app defaults)
4. code default                (registerAs namespaces / EnvironmentVariables)
```

- Each app owns `config/{default,development,production,test}.json`. JSON files are
  **flat maps of env-var names** (`{ "PORT": 3000, "LOG_LEVEL": "debug" }`).
- The loader (`loadLayeredConfig`) merges the JSON layers under `process.env`,
  writes file values into `process.env` for keys not already set, runs the
  class-validator `validateEnv` on the merged result (fail-fast at boot), then the
  `registerAs` namespaces (`app`, `database`, `jwt`, `throttle`, `messaging`,
  `metrics`, `featureFlags`, `compliance`) read typed values. Apps just use
  `ConfigService` — no new ceremony.
- **Secrets are rejected in JSON** (`SECRET_KEY_PATTERN`). They belong in the env
  only. See `docs/CONFIGURATION.md` for the full scheme + examples.
- Wire-up: `createEnvValidator({ configDir, require })` passed to
  `ConfigModule.forRoot({ validate, ignoreEnvFile: true })`.

## Enterprise/scale building blocks

- **Health:** Terminus split — `/health` (liveness), `/health/ready` (readiness:
  DB + Redis), `/health/info`. `enableShutdownHooks()` for clean rolling deploys.
- **Metrics:** `libs/common` metrics module (prom-client default metrics + HTTP
  duration histogram interceptor) at `/api/v1/metrics`, gated by `METRICS_ENABLED`
  - optional `METRICS_TOKEN` bearer.
- **Redis (optional, `REDIS_URL`):** distributed throttler storage + BullMQ
  delivery queue. Unset → in-memory throttling + inline message delivery (both
  single-instance correct). No mock Redis. `RedisService` is null-safe.
- **Messaging:** channels/providers/routing/templates + queue fan-out. Resend email
  with console-email fallback (no provider key ⇒ logged, not sent). IN_APP channel
  writes through a host-provided `IN_APP_SINK` (the api's `NotificationsService`).
- **Compliance:** append-only HMAC hash-chained audit trail (`AuditService` +
  `verifyChain`), GDPR export/erasure (`DataSubjectService` over the
  `PersonalDataRegistry`), consent ledger, retention cron. `/privacy/*` +
  `/admin/audit/verify` routes. Rules: `docs/agents/compliance.md`;
  framework mapping: `docs/COMPLIANCE.md`.

## How to extend

- **Add a module (api):** `nx g @nx/nest:module modules/<name> --project=api`, add
  service + controller + DTOs (validated) + specs (≥90%). Register in
  `app.module.ts`. Guards apply by default; mark `@Public()` only if truly public.
  Follow `modules/tasks` as the canonical example (pagination, ownership, cache,
  messaging hook).
- **Add a migration:** hand-write under `libs/database/src/migrations/`
  (timestamp-prefixed); use the enum `DO $$…$$` guard. `npm run migration:run`.
- **Add a lib:** `nx g @nx/js:lib <name>` under `libs/`; respect the ORM-free rule
  for anything used outside the API. Add the `@clevrook/<name>` path alias.
- **Add config:** add the key to the app's `config/*.json` (non-secret) or
  `.env.example` (secret), a validation rule in `libs/config`, and read it via a
  namespace — never `process.env` directly.
- **Add a module that stores personal data:** also register a
  `PersonalDataContributor` (+ `RetentionTarget` if the data ages out) in the
  compliance wiring service — recipe in `docs/agents/recipes.md`.
