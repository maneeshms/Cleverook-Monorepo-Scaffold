# Workflows

## Branching & PRs

- Branch off `main`: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`.
- Conventional Commit messages. Focused PRs (~≤400 lines).
- A PR is mergeable only when all CI gates are green (below) and the change ships
  with tests.

## CI gates (`.github/workflows/`)

- **ci.yml** — `format:check` (prettier, whole repo) · `verify` (lint + typecheck +
  build + unit with the ≥90% coverage gate) · `e2e` (Postgres service container →
  `e2e:setup` → `e2e`) · `docker` (builds every deployable app image, no push).
  Trivy **fails on CRITICAL** in every run; the SARIF upload is gated (see below).
- **security.yml** — npm audit (root + each frontend, block on CRITICAL) ·
  gitleaks · dependency-review (PRs).
- **image-scan.yml** — **daily** (04:30 UTC + dispatch) Trivy scan of every
  deployable image rebuilt fresh from `main` (`pull: true` for current base
  layers). Fixable CRITICAL/HIGH → auto-managed GitHub issue per app (label
  `vulnerability`, refreshed while present, auto-closed when clean) + red run.
  Accepted risks: `.trivyignore` (owner + reason + expiry required per entry —
  it feeds the ci.yml CRITICAL gate too). SLAs + remediation playbook:
  `docs/SECURITY.md` → _Continuous vulnerability management_.
- **codeql.yml** — CodeQL `security-and-quality` on push/PR + weekly.
- **init-matrix.yml** — runs every `init.mjs` orm×frontend combo → install/build/
  test (dispatch + weekly). Removed from generated projects.
- **dependabot-automerge.yml** — after a green CI run on a Dependabot PR, merges
  it automatically **only if every bump is minor/patch** (parses the "from X to Y"
  pairs; anything major — including the isolated `major-updates` group PRs — is
  left for human review, and all other checks on the SHA must be green first).

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

**Switching runners (GitHub-hosted ⇄ self-hosted).** Every job resolves its
runner as `${{ vars.CI_RUNNER || 'ubuntu-latest' }}`:

- **GitHub-hosted (default):** leave `CI_RUNNER` unset.
- **Self-hosted** (e.g. Actions minutes exhausted):
  `gh variable set CI_RUNNER --body self-hosted` — applies to every run started
  after that (re-run failed jobs to pick it up). Switch back:
  `gh variable delete CI_RUNNER`.

The jobs are deliberately runner-agnostic: e2e starts its own disposable Postgres
via `docker run` on port **55432** (`services:` containers are Linux-only, and
5432/5433 are usually taken on dev machines — the container is force-removed in
an `always()` step so nothing lingers on a persistent runner), and gitleaks picks
the binary matching the runner OS/arch with a per-platform SHA pin. Self-hosted
prerequisites: Docker running (docker/image-scan/e2e jobs) and the machine awake
for scheduled runs — a sleeping laptop queues the daily image scan until it wakes
(dropped after 24 h). On an Apple-Silicon runner images build as arm64 (prod is
amd64) — scans stay meaningful but digests differ. **Never point `CI_RUNNER` at a
self-hosted runner on a public repo or one accepting fork PRs** — fork PR code
would execute on that machine.

**Dependabot** (`.github/dependabot.yml`) — weekly npm (root + each frontend),
GitHub Actions, and Docker base images. Related packages are grouped, and for the
**npm** ecosystems **every major bump is funnelled into one isolated `major-updates`
PR**, so routine minor/patch updates stay safe to merge while risky majors are
reviewed (or held) deliberately. GitHub Actions / Docker bumps are low-risk tag
moves and stay grouped. To drop npm majors entirely, swap the `major-updates` group
for an `ignore` rule (documented inline). `init.mjs` prunes the ORM/frontend app blocks so
a generated project only watches the apps it actually has.

Reproduce locally before pushing:

```
npm run verify   # lint + typecheck + build + unit
npm run db:up && npm run e2e:setup && npm run e2e
```

## Migrations

- Author under `libs/database/src/migrations/` (timestamp prefix, enum
  `DO $$…$$` guard). Apply: `npm run migration:run`. Never enable `synchronize`.
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
     --frontend vite|next|both|none
# minimal core + à-la-carte capabilities:
node scripts/init.mjs --yes --minimal \
     --with-auth --with-messaging --with-feature-flags --with-metrics --with-compliance
```

init prunes unused apps/libs (dirs + sentinel-marked blocks), rewrites the CI
workflow matrices and `dependabot.yml` to the kept apps, renames the scope, removes
itself + `init-matrix.yml`, regenerates the lockfile, and runs build+test.
See `docs/GETTING_STARTED.md`.
