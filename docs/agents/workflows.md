# Workflows

## Branching & PRs

- Branch off `main`: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`.
- Conventional Commit messages. Focused PRs (~≤400 lines).
- A PR is mergeable only when all CI gates are green (below) and the change ships
  with tests.

## CI gates (`.github/workflows/`)

- **ci.yml** — `verify` (lint + typecheck + build + unit with the ≥90% coverage
  gate) · `e2e` (Postgres service container → `e2e:setup` → `e2e`) · `docker`
  (builds every deployable app image, no push). Trivy **fails on CRITICAL** in
  every run; the SARIF upload is gated (see below).
- **security.yml** — npm audit (root + each frontend, block on CRITICAL) ·
  gitleaks · dependency-review (PRs).
- **codeql.yml** — CodeQL `security-and-quality` on push/PR + weekly.
- **init-matrix.yml** — runs every `init.mjs` orm×frontend combo → install/build/
  test (dispatch + weekly). Removed from generated projects.

**Portability (private repos without GitHub Advanced Security).** CodeQL,
dependency-review, and the Trivy **SARIF upload** all need code scanning, which is
free on public repos but a paid add-on on private ones. They are gated behind the
repo variable `ENABLE_CODE_SCANNING` and **skip cleanly** until it's set — so CI is
green out of the box. Enable them once GHAS is available:
`gh variable set ENABLE_CODE_SCANNING --body true`. The Trivy CRITICAL **gate** and
gitleaks still run everywhere. gitleaks uses the license-free binary (the Action
needs a paid org license). Node version comes from `.nvmrc` in every job — no
hardcoded version. e2e JWT secrets are generated per-run (`openssl rand`), never
committed. The Docker image tag is derived from the repo name (lowercased).

**Dependabot** (`.github/dependabot.yml`) — weekly npm (root + each frontend),
GitHub Actions, and Docker base images. Related packages are grouped, and **every
major bump is funnelled into one isolated `major-updates` PR** per ecosystem, so
routine minor/patch updates stay safe to merge while risky majors are reviewed (or
held) deliberately. To drop majors entirely, swap the `major-updates` group for an
`ignore` rule (documented inline). `init.mjs` prunes the ORM/frontend app blocks so
a generated project only watches the apps it actually has.

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

init prunes unused apps/libs (dirs + sentinel-marked blocks), rewrites the CI
workflow matrices and `dependabot.yml` to the kept apps, renames the scope, removes
itself + `init-matrix.yml`, regenerates the lockfile, and runs build+test.
See `docs/GETTING_STARTED.md`.
