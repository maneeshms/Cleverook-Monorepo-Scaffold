# Getting Started

Clone → tailor → run in about 10 minutes.

## Prerequisites

- **Node 22** (`.nvmrc` pins it — `nvm use`)
- **Docker** (local Postgres + Redis)
- **Python 3** (only for `npm run scan:security`)

## 1. Clone & tailor

```bash
git clone <this-repo> my-app && cd my-app
node scripts/init.mjs              # interactive: pick name, scope, ORM, frontend(s)
```

Non-interactive:

```bash
node scripts/init.mjs --yes --name my-app --scope @myco \
  --orm typeorm --frontend next
```

`init.mjs` prunes the parts you didn't pick, renames the `@clevscaffold` scope,
removes itself and the init-matrix workflow, regenerates the lockfile, and runs a
build + test to prove the result is green. (Skip this step if you want to explore
the full scaffold with both ORMs and both frontends.)

## 2. Configure

```bash
cp .env.example .env
# Generate real JWT secrets:
openssl rand -base64 48   # -> JWT_ACCESS_SECRET
openssl rand -base64 48   # -> JWT_REFRESH_SECRET
```

Only secrets go in `.env`. Non-secret, environment-specific values live in each
app's `config/*.json`. See [CONFIGURATION.md](CONFIGURATION.md).

## 3. Start infrastructure

```bash
npm ci
npm run doctor         # preflight: node version, .env, docker, postgres ports
npm run db:up          # Postgres 16 + Redis 7 via docker compose
npm run migration:run  # TypeORM schema (apps/api)
npm run seed:api       # optional: idempotent admin account (admin@example.com)
# If you kept the Prisma app:
npm run prisma:generate && npm run prisma:migrate && npm run prisma:seed
```

> **Port 5432 taken?** (a host Postgres is common) — set `POSTGRES_PORT=5433`
> before `db:up`; compose, the e2e setup, and `npm run doctor` all honor it.
> `doctor` diagnoses the collision explicitly if you hit it.

## 4. Run

```bash
npm run dev:api          # TypeORM API   → http://localhost:3000/api/v1
npm run dev:api-prisma   # Prisma API    → http://localhost:3010/api/v1
npm run dev:web          # Vite frontend → http://localhost:5173
npm run dev:web-next     # Next frontend → http://localhost:3005
```

Check it's alive:

```bash
curl http://localhost:3000/api/v1/health
# Swagger UI: http://localhost:3000/api/docs
```

## 5. Verify everything

```bash
npm run verify             # lint + typecheck + build + unit tests, one command
npm run e2e:setup && npm run e2e
npm run scan:security      # with an api running locally
```

## Where next

- [CONFIGURATION.md](CONFIGURATION.md) — the layered config scheme
- [DATABASE.md](DATABASE.md) — local / self-hosted / Supabase, migrations
- [TESTING.md](TESTING.md) — unit, e2e, coverage, the OWASP scanner
- [SECURITY.md](SECURITY.md) — controls + scanner baseline
- [DEPLOYMENT.md](DEPLOYMENT.md) / [SCALING.md](SCALING.md) — Railway + scale-out
- [ARCHITECTURE.md](ARCHITECTURE.md) — the big picture
- [AGENTS.md](../AGENTS.md) — for AI coding agents
