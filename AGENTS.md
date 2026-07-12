# ClevScaffold — Agent Guide

Enterprise-grade, clone-and-go scaffold for Cleverook backends. NestJS 10 · Nx
monorepo · TypeScript · Node 22 · PostgreSQL · **two ORMs** (TypeORM + Prisma) ·
two frontends (Vite + Next.js) · Railway. Built for high-traffic products.

**This file is canonical for all agents (Claude, Cursor, Copilot).** The topic
docs in `docs/agents/` go deeper — read the one that matches your task before you
touch code. `CLAUDE.md`, `.cursor/rules/*`, and `.github/copilot-*` are thin
adapters that point back here.

---

## Golden rules (never violate)

1. **Tests ship with every code change.** Any behavioural change adds/updates
   `*.spec.ts`. Coverage must stay **≥ 90%** (branches, functions, lines,
   statements) — the jest preset fails the build below it. See `docs/agents/testing.md`.
2. **No secrets in code, JSON config, or logs.** Secrets live only in the
   environment (`.env` locally, host vars in prod). The config loader rejects
   secret-looking keys in JSON. See `docs/agents/security.md`.
3. **No direct `process.env`** in app/lib code — read config through
   `ConfigService` / the typed namespaces. ESLint enforces this (few justified
   exceptions: `libs/config`, `main.ts`, `app.module.ts`, `data-source.ts`, seeds).
4. **No `any`.** Use `unknown` + narrowing. Exported functions/methods declare
   explicit return types.
5. **Every dependency is exact-pinned** (no `^`/`~`). Lockfiles committed.
6. **Guards by default.** Endpoints are authenticated unless marked `@Public()`.
   Never trust identity fields from the request body — derive from the JWT.
7. **No mock/fake data.** External providers are real and configurable; when
   unconfigured they either fall back explicitly (e.g. console email) or return
   `503` — never fabricated values. `libs/messaging` is the reference.
8. **Run the gates before declaring done:** `npm run lint && npm run typecheck &&
npm run build && npm run test`, plus the relevant `npm run e2e` for backend
   changes.

---

## Structure

```
apps/
  api/          NestJS + TypeORM — FULL reference (one example per feature)
  api-prisma/   NestJS + Prisma  — compact reference (auth-lite, users, health)
  web/          React + Vite     — wiring reference (Dockerfile/nginx/railway)
  web-next/     Next.js          — wiring reference (standalone Docker/railway)
libs/
  common/       ORM-FREE: decorators, guards, filters, interceptors, redis,
                pagination, metrics, crypto, correlation-id
  config/       LAYERED config loader + class-validator validation + namespaces
  logger/       Winston LoggerService (log + audit + alert streams)
  database/     TypeORM DatabaseModule, data-source, BaseEntity, migrations
  messaging/    Omnichannel engine (channels/providers/routing/templates/queue)
                — source-only lib (no build target; apps compile it)
scripts/        init.mjs · e2e-setup.mjs · security_scan.py · docker-manifest.mjs
docs/           human docs + docs/agents/ (agent topic docs)
```

**npm workspaces:** every lib and backend app owns its **own `package.json`** with
its own dependencies. The root is a thin workspace root — shared build/test tooling
and scripts only, no runtime deps. One root lockfile (deliberate: deterministic
installs, one audit surface). Frontends stay standalone (own package.json +
lockfile). Add a dep to the package that uses it, exact-pinned, then `npm install`.

**Dependency direction:** `common` is ORM-free and imported everywhere;
`database` is TypeORM-only; `messaging` depends on `database` (TypeORM-coupled);
apps import libs, never other apps. Full rules: `docs/agents/architecture.md`.

## Commands

```bash
npm ci                       # install (exact, from lockfile)
npm run dev:api              # serve TypeORM api (watch)     :3000  /api/v1
npm run dev:api-prisma       # serve Prisma api (watch)      :3010  /api/v1
npm run dev:web              # Vite dev server               :5173
npm run dev:web-next         # Next dev server               :3005
npm run db:up / db:down      # local Postgres + Redis (docker compose)
npm run build                # nx build all
npm run test                 # nx unit tests (coverage ≥90% enforced)
npm run lint / typecheck     # eslint / tsc --noEmit
npm run e2e:setup && npm run e2e   # create+migrate test DBs, run e2e
npm run migration:run        # TypeORM migrations
npm run prisma:generate / prisma:migrate / prisma:seed
npm run scan:security        # OWASP runtime scan against a live api
```

## Configuration (layered)

Resolution per key, first hit wins: **`process.env` → `config/{NODE_ENV}.json` →
`config/default.json` → code default**. Each app owns a `config/` dir. JSON files
are flat maps of env-var names (`{ "PORT": 3000 }`); **secrets never go in JSON**.
Details + examples: `docs/CONFIGURATION.md` and `docs/agents/architecture.md`.

## Security posture (summary — full ruleset in docs/agents/security.md)

JWT: 15-min access + rotating **opaque SHA-256-hashed** refresh; refresh reuse →
revoke the whole family + CRITICAL security alert. Progressive lockout on failed
logins. Global `ValidationPipe` (`whitelist` + `forbidNonWhitelisted`). DTOs never
expose entities. helmet, strict CORS (wildcard ⇒ credentials off), 1 MB body cap,
trust proxy, correlation IDs. Parameterized queries only; migrations-only schema.
`audit()` privileged actions; error responses carry no stack traces. **Security is
the top priority — when unsure, read `docs/agents/security.md`.**

## Testing contract

Unit specs are co-located (`*.spec.ts`), mock all I/O (no real network/DB), and
keep coverage ≥ 90%. e2e specs (`apps/*/test/**/*.e2e-spec.ts`) boot the real app
against a disposable Postgres DB via `supertest`; the OWASP suite lives in
`apps/api/test/security-owasp.e2e-spec.ts`. `npm run scan:security` runs the
black-box scanner against a live API (49-check baseline, all passing). Full
workflow: `docs/agents/testing.md`.

## Topic docs — read the one that fits your task

| Doc                           | Read when                                                           |
| ----------------------------- | ------------------------------------------------------------------- |
| `docs/agents/architecture.md` | adding a module/lib/app; layered config; lib boundaries             |
| `docs/agents/security.md`     | **any** auth, validation, crypto, data-exposure, or endpoint change |
| `docs/agents/conventions.md`  | naming, types, Swagger, commits, code style                         |
| `docs/agents/testing.md`      | writing tests, coverage floor, e2e, the scanner                     |
| `docs/agents/workflows.md`    | branching, PRs, CI gates, migrations, deploys                       |
| `docs/agents/frontend.md`     | anything under `apps/web` or `apps/web-next`                        |

## Init & pruning (do not break)

`scripts/init.mjs` tailors a clone (`--orm`, `--frontend`, `--scope`, `--name`).
It prunes by directory manifests **and sentinel-marked blocks** — comments like
`clevscaffold:typeorm:start` / `clevscaffold:prisma:start` in `.env.example`,
`scripts/e2e-setup.mjs`, and workflow/config files. **Keep sentinel pairs intact
and balanced** when editing those files, or partial pruning breaks.
