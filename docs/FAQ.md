# FAQ — common developer questions

Grounded answers for day-to-day work in a generated project. Deep dives are
linked; when a command exists, prefer it over doing the steps by hand.

## Project shape & naming

**I just cloned this — where do I start?**
[GETTING_STARTED.md](GETTING_STARTED.md), top to bottom. It includes a
60-second glossary if Nx, ORMs, or migrations are new to you. Come back here
when you have a specific question.

**Why is my app called `apps/my-app-api` and not `apps/api`?**
Init derives every kept app's name from your project name (`<name>-api`,
`<name>-web`, `<name>-mobile`) and rewrites all hardcoded references —
Dockerfile paths and `CMD`, `railway.json`, CI/image matrices, project.json,
docs. Your deploys are distinguishable across projects instead of five services
all called "api".

**How do I rename an app later?**
`node scripts/rename-app.mjs --from my-app-api --to billing` — same rewrite,
any time. `.clevscaffold.json` tracks renames so `add.mjs` keeps working.

**How do I add another app (second API, admin frontend, driver app)?**
`node scripts/new-app.mjs --type api|vite|next|expo --name <kebab> [--port N]`.
It clones the reference from a pristine scaffold, reduces it to a bare shell,
and registers it everywhere (workspaces, CI, Dependabot). See
[EVOLVING.md](EVOLVING.md).

## Capabilities & future libs

**I started `--minimal` — how do I enable auth/messaging/… later?**
`node scripts/add.mjs <capability>`; `node scripts/add.mjs --list` shows what's
installed vs available. The only manual step is applying the generated
`docs/wiring-<cap>.md` guide. See [EVOLVING.md](EVOLVING.md).

**The scaffold gained a NEW lib after I generated my project. How do I get it?**
The same way: every scaffold lib ships as a **capability**, and `add.mjs` reads
the capability manifest from the _fetched_ scaffold, not your local copy — so
capabilities that didn't exist when you generated are still installable:

```bash
node scripts/add.mjs --list --ref main    # see what the scaffold has now
node scripts/add.mjs realtime --ref main  # pull one in
```

`--ref main` takes the scaffold's latest instead of the commit you generated
from — review the diff it brings; newer capabilities may expect newer shared
libs (upgrade those via the same `add`/manual diff, or regenerate for a major
jump).

**Can I remove a capability I no longer want?**
No tool for that (rarely worth automating): delete the lib/module dirs, its
migrations (write a down-migration for applied schemas), the `forRootAsync`
block, tsconfig path, and package dep — the capability's entry in
`scripts/scaffold-manifest.mjs` in a pristine scaffold lists exactly what it
owns. Then `npm install && npm run verify`.

## Everyday development

**Where do I put a new feature?**
A module under your API app's `src/modules/` — mirror `modules/tasks` (the
canonical example). Step-by-step: `docs/agents/recipes.md` ("Add a feature
module").

**Where do config values and secrets go?**
Secrets → `.env` only. Non-secret, environment-specific values → the app's
`config/{NODE_ENV}.json`. Everything is read through `ConfigService` — never
`process.env` in feature code. See [CONFIGURATION.md](CONFIGURATION.md).

**How do I run things?**
`npm run doctor` (preflight) · `npm run db:up` (Postgres+Redis) ·
`npm run dev:<app>` · `npm run verify` (format+lint+typecheck+build+unit) ·
`npm run e2e:setup && npm run e2e`. Port 5432 busy? `POSTGRES_PORT=5433` —
compose, e2e, and doctor all honor it.

**How do database changes work?**
Migrations only — never `synchronize`. `npm run migration:generate` → review →
`npm run migration:run`. Postgres enum gotcha and conventions:
[DATABASE.md](DATABASE.md), `docs/agents/recipes.md`.

**How do I send an email / push / in-app notification? Live updates?**
`MessagingService.dispatch(...)` for messages; connected clients get in-app
notifications live via the socket ([REALTIME.md](REALTIME.md)). Never
hand-roll nodemailer/ws in a feature.

**How do dependency updates work?**
Dependabot: minor/patch grouped and auto-merged when CI is green; every major
lands in one isolated `major-updates` PR you review. Add deps exact-pinned to
the package that uses them, then `npm install` at the root. Expo apps: bump
`expo-*` with `npx expo install`.

**Why do libs have no build target ("source-only")?**
Apps compile the libs they import (tsc + tsc-alias into their own dist) — one
compilation, no `rootDir` conflicts, and Docker images stay lean via
`scripts/docker-manifest.mjs`. Don't add build targets to `libs/*`.

**Why did CI fail on my commit message?**
Conventional Commits enforced by commitlint (husky): `type(scope): lower-case
subject`. See `docs/agents/conventions.md`.

## Deploy & operations

**How do I deploy?** [DEPLOYMENT.md](DEPLOYMENT.md) — each deployable app has a
Dockerfile + `railway.json`; migrations run in the container CMD before serve.

**How do I scale to multiple instances?** Set `REDIS_URL` — throttling, the
email queue, and the realtime channel all switch to Redis-backed coordination
automatically. [SCALING.md](SCALING.md).

**CI minutes ran out / I want my own runner.**
`gh variable set CI_RUNNER --body self-hosted` (all workflows read it);
`gh variable delete CI_RUNNER` to go back to GitHub-hosted.

**Where do security scans live?** `npm run scan:security` against a running
API; CI runs npm audit, gitleaks, Trivy (+ daily image scan with auto-managed
issues). [SECURITY.md](SECURITY.md).
