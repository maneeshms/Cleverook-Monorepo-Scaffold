# Architecture

The big picture for humans. For the agent-facing extension rules, see
[`docs/agents/architecture.md`](agents/architecture.md).

## Monorepo map

```
ClevScaffold (Nx workspace, npm, Node 22)
│
├── apps/
│   ├── api/          NestJS + TypeORM — full reference API
│   ├── api-prisma/   NestJS + Prisma  — compact reference API
│   ├── web/          React + Vite     — frontend wiring reference
│   └── web-next/     Next.js          — frontend wiring reference
│
├── libs/
│   ├── common/       ORM-free building blocks (used by every app)
│   ├── config/       layered config loader + validation + typed namespaces
│   ├── logger/       Winston LoggerService (log + audit + alert streams)
│   ├── database/     TypeORM DatabaseModule, data-source, BaseEntity, migrations
│   ├── feature-flags/ OpenFeature engine — env|database providers (source-only lib)
│   └── messaging/    omnichannel engine (source-only lib)
│
├── scripts/          init.mjs · e2e-setup.mjs · security_scan.py
└── docs/             human docs + docs/agents/ (agent topic docs)
```

## Dependency rules

```
common  ─── ORM-free ───────────────► imported by everything
config ─┐
logger ─┤
database├─ TypeORM-coupled
feature-flags┤  (depends on common + database + logger)
messaging┘  (depends on database)

api        → common, config, logger, database, feature-flags, messaging
api-prisma → common, config, logger              (no TypeORM libs)
web / web-next → standalone (own package.json + lockfile, not workspaces)
```

- `common` never imports an ORM, so both API apps can share it. `BaseEntity` lives
  in `database`, not `common`.
- `feature-flags` and `messaging` are **source-only libs** (no Nx build target) —
  apps compile them; each takes runtime config via `forRootAsync` from the host.
- Apps never import other apps.

## Packages (npm workspaces)

Every lib and backend app has its **own `package.json`** declaring its own
dependencies; the root is a thin workspace root with shared build/test tooling
only. One root lockfile (deterministic installs, one audit surface). Frontends are
standalone (own package.json + lockfile). Docker images stay lean — each app's
runtime installs only its own dependency closure via `scripts/docker-manifest.mjs`
(so the api image has no Prisma, and the api-prisma image has no TypeORM). See
[docs/agents/architecture.md](agents/architecture.md).

## Request lifecycle (api)

```
HTTP ─► helmet ─► correlationId ─► CORS ─► body-limit(1MB)
     ─► ValidationPipe (whitelist + transform)
     ─► Throttle guard ─► JwtAuth guard ─► Roles guard
     ─► Controller (thin) ─► Service (logic + authorization)
     ─► TypeORM/Prisma (parameterized) ─► DTO out
     ─► HttpExceptionFilter (normalized shape) ─► response (+x-request-id)
   [LoggingInterceptor + HTTP-metrics interceptor wrap the whole thing]
```

## Cross-cutting subsystems

- **Config (layered):** `process.env → config/{NODE_ENV}.json → config/default.json
→ code default`, validated at boot. [CONFIGURATION.md](CONFIGURATION.md).
- **Auth:** 15-min access JWT + rotating opaque hashed refresh with reuse
  detection; progressive lockout. [SECURITY.md](SECURITY.md).
- **Logging:** Winston with `log`/`audit`/`alert` streams; correlation IDs.
- **Health:** Terminus liveness (`/health`), readiness (`/health/ready`, checks
  DB + Redis), info; graceful shutdown.
- **Metrics:** prom-client at `/api/v1/metrics` (token-gated).
- **Redis (optional):** distributed throttler storage + BullMQ delivery queue, with
  single-instance fallbacks. [SCALING.md](SCALING.md).
- **Messaging:** channels/providers/routing/templates + queue fan-out; Resend email
  with console fallback; IN_APP via a host-provided sink (the api's
  `NotificationsService`).
- **Feature flags:** OpenFeature façade with `env` (`FF_<KEY>`) or `database`
  (`feature_flags` table, TTL-cached) providers, chosen via `FEATURE_FLAG_PROVIDER`.
  Call sites use `flags.isEnabled('key')`; swap providers (incl. a hosted one like
  LaunchDarkly) without touching them. Admin CRUD at `/feature-flags`
  (`@Roles(ADMIN)`).

## The `tasks` module — the canonical example

`apps/api/src/modules/tasks` demonstrates every scaffold feature end to end:
validated DTOs, pagination/filter/sort, ownership checks (BOLA-safe 404s),
cache-aside stats via `RedisService`, and a messaging hook (in-app notification +
console email on assignment). Copy its shape when adding a module.

## How to grow it

Adding a module, lib, migration, or config key: see
[`docs/agents/architecture.md`](agents/architecture.md). Tailoring a clone to fewer
ORMs/frontends: `scripts/init.mjs` (see [GETTING_STARTED.md](GETTING_STARTED.md)).
