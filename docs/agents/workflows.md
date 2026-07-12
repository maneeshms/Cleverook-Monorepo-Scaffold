# Workflows

## Branching & PRs

- Branch off `main`: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`.
- Conventional Commit messages. Focused PRs (~≤400 lines).
- A PR is mergeable only when all CI gates are green (below) and the change ships
  with tests.

## CI gates (`.github/workflows/`)

- **ci.yml** — `verify` (lint + typecheck + build + unit with the ≥90% coverage
  gate) · `e2e` (Postgres service container → `e2e:setup` → `e2e`) · `docker`
  (builds all four app images, no push).
- **security.yml** — npm audit (root + `apps/web` + `apps/web-next`, block on
  CRITICAL) · gitleaks · dependency-review (PRs).
- **codeql.yml** — CodeQL `security-and-quality` on push/PR + weekly.
- **init-matrix.yml** — runs every `init.mjs` orm×frontend combo → install/build/
  test (dispatch + weekly). Removed from generated projects.

Reproduce locally before pushing:
```
npm run lint && npm run typecheck && npm run build && npm run test
npm run db:up && npm run e2e:setup && npm run e2e
```

## Migrations

- **TypeORM:** author under `libs/database/src/migrations/` (timestamp prefix, enum
  `DO $$…$$` guard). Apply: `npm run migration:run`. Never enable `synchronize`.
- **Prisma:** edit `apps/api-prisma/prisma/schema.prisma` → `npm run prisma:migrate`
  (dev) / `npm run prisma:deploy` (prod/CI). Commit the generated migration.
- Migrations run **before** app start in the Docker CMD and on Railway deploy.

## Deployment (Railway)

- Each deployable app has a `Dockerfile` + `railway.json`. Multi-stage builds,
  non-root runtime, `npm audit` gate, migrate-then-start CMD.
- Secrets set as Railway service variables (never committed). `CONFIG_DIR` points
  at the app's baked `config/` dir; non-secret env-specific values live in
  `config/production.json`.
- Details + per-app specifics: `docs/DEPLOYMENT.md`. Scaling: `docs/SCALING.md`.

## Tailoring a fresh clone

```
node scripts/init.mjs            # interactive
node scripts/init.mjs --yes --name my-app --scope @myco \
     --orm typeorm|prisma|both --frontend vite|next|both|none
```
init prunes unused apps/libs (dirs + sentinel-marked blocks), renames the scope,
removes itself + `init-matrix.yml`, regenerates the lockfile, and runs build+test.
See `docs/GETTING_STARTED.md`.
