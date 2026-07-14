# ClevScaffold — Agent Guide

Enterprise-grade, clone-and-go scaffold for Cleverook backends. NestJS 11 · Nx
monorepo · TypeScript · Node 22 · PostgreSQL · **two ORMs** (TypeORM + Prisma) ·
two frontends (Vite + Next.js) · Railway. Built for high-traffic products.

**This file is canonical for all agents (Claude, Cursor, Copilot).** The topic
docs in `docs/agents/` go deeper — read the one that matches your task before you
touch code. `CLAUDE.md`, `.cursor/rules/*`, and `.github/copilot-*` are thin
adapters that point back here.

How to work here, in one paragraph: find the existing pattern for what you're
building (`modules/tasks` is the canonical module; `docs/agents/nestjs.md` shows
every shape), follow the matching recipe in `docs/agents/recipes.md`, and prove
you're done with `npm run verify` + the self-audit at the bottom of this file.
These rules constrain **how** code is written, never **what** you're allowed to
build — anything not covered: mirror the nearest existing pattern, or introduce a
new one _and say so explicitly_ in the PR/response.

---

## Golden rules (never violate — each exists for a reason)

1. **Tests ship with every code change.** Coverage stays **≥ 90%** (branches,
   functions, lines, statements). _Why: untested scaffold code gets copied into
   every downstream project — bugs here multiply._
2. **No secrets in code, JSON config, or logs.** Secrets live only in the
   environment. _Why: this repo is cloned and forked; a leaked secret ships to
   every clone._
3. **No direct `process.env`** in app/lib code — read config through
   `ConfigService` / typed namespaces. _Why: layering + fail-fast validation only
   work when the loader is the single entry point._
4. **No `any`; explicit return types on exports.** Use `unknown` + narrowing.
   _Why: `any` disables the type system exactly where mistakes hide._
5. **Every dependency is exact-pinned** (no `^`/`~`); lockfile committed in the
   same change; deps belong to the package that imports them, never the root.
   _Why: reproducible builds and one auditable supply-chain surface._
6. **Guards by default; identity from the JWT.** Endpoints are authenticated
   unless `@Public()`; never trust `userId`/`ownerId`/role fields from the request
   body. _Why: BOLA/IDOR is the #1 API vulnerability class._
7. **No mock/fake data.** External providers are real + configurable; when
   unconfigured they fall back explicitly (e.g. console email) or return `503` —
   never fabricated values. _Why: fake success hides misconfiguration until
   production._
8. **Prove done, don't declare it:** `npm run verify`, plus `npm run e2e` for
   backend behaviour, plus the self-audit below.

## What enforces what (know where the machine has your back)

| Rule                       | Enforced by                                                                                                                       | If it fires                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Coverage ≥ 90%             | jest preset `coverageThreshold` + CI                                                                                              | write real tests — see below for what you may NOT do |
| No `process.env`           | ESLint `no-restricted-syntax` (allowlist: `libs/config`, `main.ts`, `app.module.ts`, `data-source.ts`, seeds, `prisma.config.ts`) | use a config namespace                               |
| No `any`, return types     | ESLint + `tsc --noEmit`                                                                                                           | fix the types                                        |
| No `console.*` in app code | ESLint                                                                                                                            | use `LoggerService`                                  |
| Secrets in JSON config     | config loader throws at boot (`SECRET_KEY_PATTERN`)                                                                               | move to env                                          |
| Secrets in git             | gitleaks (CI)                                                                                                                     | rotate + purge, never just delete                    |
| Exact pins                 | `.npmrc save-exact` + review                                                                                                      | pin manually if a range slips in                     |
| Validation whitelist       | global `ValidationPipe` (`forbidNonWhitelisted`)                                                                                  | fix the DTO, don't loosen the pipe                   |
| Commit format              | commitlint (husky)                                                                                                                | Conventional Commits                                 |
| Formatting                 | prettier (lint-staged)                                                                                                            | let it run; don't hand-format                        |
| OWASP behaviour            | `security-owasp.e2e-spec.ts` + `npm run scan:security`                                                                            | fix the code, keep the baseline                      |

Everything **not** in this table (BOLA-safe 404s, thin controllers, migration
discipline, response DTOs…) is enforced only by you and review — those deserve
_extra_ care, not less.

## Getting to green — lines you may never cross

When a gate fails, **the code is wrong, not the gate.** Never, under any
circumstances, to make checks pass:

- lower or edit `coverageThreshold`, exclude files from coverage, or write
  assertion-free tests to farm coverage;
- `.skip`/`.only`/delete a failing test, or weaken its assertions;
- add `eslint-disable`, `@ts-ignore`/`@ts-expect-error`, or `as any`/`as unknown as`
  without a one-line justification comment — and never to silence a real defect;
- loosen `tsconfig`, the `ValidationPipe` options, guard wiring, helmet/CORS
  settings, or throttle limits;
- use `npm install --force` / `--legacy-peer-deps`, or delete the lockfile to make
  a dependency conflict "go away";
- touch these **guardrail files** except when the task is explicitly about them:
  `jest.preset.js`, `eslint.config.mjs`, `.npmrc`, `tsconfig.base.json`,
  `.github/workflows/*`, `scripts/init.mjs`, sentinel comments anywhere.

**The escape hatch (use it — that's what makes these rules non-restrictive):**
if a rule genuinely blocks the task, or two rules conflict, **stop and surface
it**: state the conflict, propose the deviation and its blast radius, and wait
for a human call (in a PR: implement the compliant subset and flag the rest).
A flagged deviation is fine; a silent one is never.

## Structure

```
apps/
  api/          NestJS + TypeORM — FULL reference (one example per feature)
  api-prisma/   NestJS + Prisma 7 (pg driver adapter) — compact reference
  web/          React + Vite     — wiring reference (Dockerfile/nginx/railway)
  web-next/     Next.js          — wiring reference (standalone Docker/railway)
libs/
  common/       ORM-FREE: decorators, guards, filters, interceptors, redis,
                pagination, metrics, crypto, correlation-id
  config/       LAYERED config loader + class-validator validation + namespaces
  logger/       Winston LoggerService (log + audit + alert streams)
  database/     TypeORM DatabaseModule, data-source, BaseEntity, migrations
  feature-flags/ OpenFeature engine (env|database providers, forRootAsync) —
                source-only lib; swap providers without touching call sites
  messaging/    Omnichannel engine (channels/providers/routing/templates/queue)
                — source-only lib (no build target; apps compile it)
scripts/        init.mjs · doctor.mjs · e2e-setup.mjs · seed-api.mjs ·
                security_scan.py · docker-manifest.mjs
docs/           human docs + docs/agents/ (agent topic docs)
```

**npm workspaces:** every lib and backend app owns its **own `package.json`**.
The root is a thin workspace root — shared tooling only, no runtime deps. One
root lockfile. Frontends stay standalone (own package.json + lockfile).

**Dependency direction:** `common` is ORM-free and imported everywhere;
`database`/`feature-flags`/`messaging` are TypeORM-coupled (the Prisma app never
imports them); apps import libs, never other apps. Full rules:
`docs/agents/architecture.md`.

## Commands

```bash
npm ci                       # install (exact, from lockfile)
npm run doctor               # preflight: node/.env/docker/postgres-port checks
npm run verify               # lint + typecheck + build + unit in one command
npm run dev:api              # serve TypeORM api (watch)     :3000  /api/v1
npm run dev:api-prisma       # serve Prisma api (watch)      :3010  /api/v1
npm run dev:web              # Vite dev server               :5173
npm run dev:web-next         # Next dev server               :3005
npm run db:up / db:down      # local Postgres + Redis (docker compose)
npm run e2e:setup && npm run e2e   # create+migrate test DBs, run e2e
npm run migration:run        # TypeORM migrations
npm run seed:api             # TypeORM admin seed (idempotent)
npm run prisma:generate / prisma:migrate / prisma:seed
npm run scan:security        # OWASP runtime scan against a live api
```

## Configuration (layered)

Resolution per key, first hit wins: **`process.env` → `config/{NODE_ENV}.json` →
`config/default.json` → code default**. Each app owns a `config/` dir. JSON files
are flat maps of env-var names (`{ "PORT": 3000 }`); **secrets never go in JSON**.
Details: `docs/CONFIGURATION.md` · adding a key: `docs/agents/recipes.md`.

## Security posture (summary — full ruleset in docs/agents/security.md)

JWT: 15-min access + rotating **opaque SHA-256-hashed** refresh; refresh reuse →
revoke the whole family + CRITICAL security alert. Progressive lockout. Global
`ValidationPipe` (`whitelist` + `forbidNonWhitelisted`). DTOs never expose
entities. helmet, strict CORS (wildcard ⇒ credentials off), 1 MB body cap, trust
proxy, correlation IDs. Parameterized queries only; migrations-only schema.
`audit()` privileged actions; error responses carry no internals. **Security is
the top priority — any auth/validation/data change starts with
`docs/agents/security.md`, and auth changes follow the special protocol in
`docs/agents/recipes.md`.**

## Topic docs — read the one that fits your task

| Doc                           | Read when                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `docs/agents/nestjs.md`       | **any backend code** — module/controller/service/DTO/ORM shapes, with code   |
| `docs/agents/recipes.md`      | **any multi-step task** — module, endpoint, migration, config key, dep, auth |
| `docs/agents/security.md`     | **any** auth, validation, crypto, data-exposure, or endpoint change          |
| `docs/agents/compliance.md`   | **audit trail, GDPR export/erasure, consent, retention** (`libs/compliance`) |
| `docs/agents/architecture.md` | adding a lib/app; lib boundaries; workspaces; lean Docker                    |
| `docs/agents/conventions.md`  | naming, types, Swagger, commits, code style                                  |
| `docs/agents/testing.md`      | writing tests, coverage floor, e2e, the scanner                              |
| `docs/agents/workflows.md`    | branching, PRs, CI gates, migrations, deploys                                |
| `docs/agents/frontend.md`     | anything under `apps/web` or `apps/web-next`                                 |

## Definition of done — self-audit before you claim it

Run through this list; if any line fails, you are not done:

- [ ] `npm run verify` green; `npm run e2e` green for behavioural backend changes
- [ ] Every new/changed behaviour has a test that would fail without the change
- [ ] New endpoints: DTO-validated, Swagger-decorated, guarded (or explicitly
      `@Public()`), ownership checked in the service, OWASP e2e extended if sensitive
- [ ] No new `any`, `process.env`, `console.*`, unpinned dep, or secret anywhere
- [ ] Schema changes are migrations (with working `down()` / committed Prisma dir)
- [ ] New env keys: validated in `libs/config` + documented (`.env.example`/JSON)
- [ ] Sentinel pairs (`clevscaffold:*:start/end`) intact and balanced
- [ ] Nothing from the "lines you may never cross" list happened
- [ ] Any deviation from these docs is **explicitly flagged**, not buried

## Init & pruning (do not break)

`scripts/init.mjs` tailors a clone (`--orm`, `--frontend`, `--scope`, `--name`).
It prunes by directory manifests **and sentinel-marked blocks** — comments like
`clevscaffold:typeorm:start` / `clevscaffold:prisma:start` in `.env.example`,
`app.module.ts`, `scripts/e2e-setup.mjs`, and workflow/config files. **Keep
sentinel pairs intact and balanced** when editing those files, or partial pruning
breaks generated projects.

**The apps are reference/sample apps.** By default init keeps them whole. `--minimal`
emits a **bare, bootable core** (config + logger + database + health + throttler;
Redis optional) and you opt capabilities back in à la carte:

| Flag                   | Adds                                                                              |
| ---------------------- | --------------------------------------------------------------------------------- |
| `--with-auth`          | JWT auth + users (+ `InitUsersAndSessions` migration)                             |
| `--with-messaging`     | messaging engine + notifications sink (**implies auth** — notifications FK→users) |
| `--with-feature-flags` | `@clevrook/feature-flags` module                                                  |
| `--with-metrics`       | Prometheus `/metrics` endpoint                                                    |

Capabilities are `clevscaffold:<token>:start/end` blocks (tokens `auth`, `messaging`,
`featureflags`, `metrics`, `tasks` — single lowercase words; the marker regex is
`[a-z]+`) across `app.module.ts`, `main.ts`, `auth.service.ts(+spec)`,
`schema.prisma`, `.env.example`. The `tasks` demo is reference-only (always dropped
in `--minimal`, never re-addable). Each capability also maps to module dirs +
migrations + a lib path/dep in the `CAPABILITIES` manifest. **JWT secrets are
optional in the shared env class** and enforced per-app via `createEnvValidator`'s
`require` list (gated under `auth`) — so a core app boots without them. When adding
an optional feature, wrap every symbol (imports included, one per line) in its
sentinel block so stripping leaves valid, lint-clean code.
