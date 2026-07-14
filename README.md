# ClevScaffold

**Enterprise-grade, clone-and-go scaffold for Cleverook backends.** A NestJS + Nx
monorepo distilled from production repos, hardened for high-traffic products, with
first-class support for AI coding agents. Clone it, run `init`, and start shipping.

```
NestJS 11 · Nx · TypeScript · Node 22 · PostgreSQL 16
TypeORM ⟷ Prisma  ·  Vite ⟷ Next.js  ·  Redis (optional)  ·  Railway
```

## Why

Starting a new service shouldn't mean re-deciding auth, config, logging, testing,
CI, and security every time. ClevScaffold bakes those decisions in — correctly,
once — and `scripts/init.mjs` strips it down to just what your project needs.

## What's inside

| Area               | What you get                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Two ORMs**       | `apps/api` (TypeORM, full reference) + `apps/api-prisma` (Prisma, compact). Pick per project at init.                                                                           |
| **Two frontends**  | `apps/web` (Vite) + `apps/web-next` (Next.js) — Docker + Railway wiring references.                                                                                             |
| **Auth**           | 15-min access JWT + rotating opaque hashed refresh with reuse detection; progressive lockout; RBAC.                                                                             |
| **Layered config** | `process.env → config/{NODE_ENV}.json → config/default.json → code default`, validated at boot. Secrets never in JSON.                                                          |
| **Security**       | helmet, strict CORS, validated DTOs, parameterized queries, audit/alert logging, OWASP e2e + a 49-check runtime scanner (baseline 49/49).                                       |
| **Scale**          | Stateless apps, Redis-backed throttling + BullMQ queue, health/readiness probes, graceful shutdown, Prometheus metrics.                                                         |
| **Quality gates**  | Unit coverage floor **≥ 90%** (enforced), full e2e, ESLint 9 flat config, CI for build/test/e2e/docker/security (CodeQL + dependency-review opt-in via `ENABLE_CODE_SCANNING`). |
| **Messaging**      | Omnichannel `libs/messaging` (channels/providers/routing/templates/queue), Resend email + console fallback, in-app sink.                                                        |
| **Agent-ready**    | `AGENTS.md` canonical + `docs/agents/*` topic docs + adapters for Claude, Cursor, and Copilot.                                                                                  |

## Quick start

```bash
git clone <this-repo> my-app && cd my-app
node scripts/init.mjs --yes --name my-app --scope @myco --orm typeorm --frontend next
cp .env.example .env          # add real JWT secrets (openssl rand -base64 48)
npm ci && npm run db:up && npm run migration:run
npm run dev:api               # http://localhost:3000/api/v1  (Swagger: /api/docs)
```

Full walkthrough: **[docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)**.

## Documentation

- [GETTING_STARTED](docs/GETTING_STARTED.md) — clone → init → run
- [CONFIGURATION](docs/CONFIGURATION.md) — the layered config scheme
- [DATABASE](docs/DATABASE.md) — local / self-hosted / Supabase, migrations
- [TESTING](docs/TESTING.md) — unit, e2e, coverage, the OWASP scanner
- [SECURITY](docs/SECURITY.md) — threat→control map + scanner baseline
- [COMPLIANCE](docs/COMPLIANCE.md) — SOC 2 / GDPR / ISO 27001 control map + `--with-compliance`
- [DEPLOYMENT](docs/DEPLOYMENT.md) — Railway, per app
- [SCALING](docs/SCALING.md) — horizontal scale-out checklist
- [ARCHITECTURE](docs/ARCHITECTURE.md) — the big picture
- [ROADMAP](docs/ROADMAP.md) — security-audit findings + prioritized enterprise backlog
- **[AGENTS.md](AGENTS.md)** — for AI coding agents (+ `docs/agents/*`)

## Commands

```bash
npm run doctor               # preflight checks (node, .env, docker, ports)
npm run dev:api | dev:api-prisma | dev:web | dev:web-next
npm run db:up | db:down
npm run verify               # lint + typecheck + build + test in one go
npm run e2e:setup && npm run e2e
npm run migration:run | seed:api | prisma:migrate | prisma:seed
npm run scan:security
```

## Tailoring

`node scripts/init.mjs` (interactive) or with flags: `--name`, `--scope`,
`--orm typeorm|prisma|both`, `--frontend vite|next|both|none`, `--yes`. It prunes
unused apps/libs, renames the scope, and verifies the result builds and tests green.

## License

Internal Cleverook scaffold. Adapt per project.
