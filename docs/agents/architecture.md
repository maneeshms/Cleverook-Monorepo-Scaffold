# Architecture

How the pieces fit, the boundaries you must respect, and how to extend the repo.

## Layout & dependency direction

```
libs/common   (ORM-free)  ──imported by everything
libs/config   (loader + validation + typed namespaces)
libs/logger   (Winston: log + audit + alert)
libs/database (TypeORM only: DatabaseModule, data-source, BaseEntity, migrations)
libs/messaging(depends on database; TypeORM-coupled; source-only lib)
apps/api           → common, config, logger, database, messaging   (TypeORM)
apps/api-prisma    → common, config, logger                        (Prisma)
apps/web, web-next → standalone frontends (own package.json/lockfile)
```

**Rules:**
- `libs/common` is **ORM-free** — no TypeORM/Prisma imports — so the Prisma app can
  use it. `BaseEntity` lives in `libs/database` (not common) for the same reason.
- `libs/database` and `libs/messaging` are **TypeORM-coupled**; the Prisma app does
  not import them. `init.mjs --orm prisma` prunes them.
- `libs/messaging` has **no Nx build target** — it's a source-only lib; consuming
  apps compile it. Adding a build target reintroduces the `rootDir` errors we
  removed. Keep it source-only.
- **Apps never import other apps.** Shared code goes in a lib.
- Path aliases: `@clevscaffold/{common,config,logger,database,messaging}`.

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
  `metrics`) read typed values. Apps just use `ConfigService` — no new ceremony.
- **Secrets are rejected in JSON** (`SECRET_KEY_PATTERN`). They belong in the env
  only. See `docs/CONFIGURATION.md` for the full scheme + examples.
- Wire-up: `createEnvValidator({ configDir, require })` passed to
  `ConfigModule.forRoot({ validate, ignoreEnvFile: true })`.

## Enterprise/scale building blocks

- **Health:** Terminus split — `/health` (liveness), `/health/ready` (readiness:
  DB + Redis), `/health/info`. `enableShutdownHooks()` for clean rolling deploys.
- **Metrics:** `libs/common` metrics module (prom-client default metrics + HTTP
  duration histogram interceptor) at `/api/v1/metrics`, gated by `METRICS_ENABLED`
  + optional `METRICS_TOKEN` bearer.
- **Redis (optional, `REDIS_URL`):** distributed throttler storage + BullMQ
  delivery queue. Unset → in-memory throttling + inline message delivery (both
  single-instance correct). No mock Redis. `RedisService` is null-safe.
- **Messaging:** channels/providers/routing/templates + queue fan-out. Resend email
  with console-email fallback (no provider key ⇒ logged, not sent). IN_APP channel
  writes through a host-provided `IN_APP_SINK` (the api's `NotificationsService`).

## How to extend

- **Add a module (api):** `nx g @nx/nest:module modules/<name> --project=api`, add
  service + controller + DTOs (validated) + specs (≥90%). Register in
  `app.module.ts`. Guards apply by default; mark `@Public()` only if truly public.
  Follow `modules/tasks` as the canonical example (pagination, ownership, cache,
  messaging hook).
- **Add a migration (TypeORM):** hand-write under `libs/database/src/migrations/`
  (timestamp-prefixed); use the enum `DO $$…$$` guard. `npm run migration:run`.
- **Add a Prisma field:** edit `apps/api-prisma/prisma/schema.prisma`, then
  `npm run prisma:migrate`. Keep `@@map`/snake_case.
- **Add a lib:** `nx g @nx/js:lib <name>` under `libs/`; respect the ORM-free rule
  for anything both apps consume. Add the `@clevscaffold/<name>` path alias.
- **Add config:** add the key to the app's `config/*.json` (non-secret) or
  `.env.example` (secret), a validation rule in `libs/config`, and read it via a
  namespace — never `process.env` directly.
