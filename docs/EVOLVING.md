# Evolving a generated project

At init you picked pieces — an ORM, frontends, capabilities. **None of those
choices are final.** Init writes **`.clevscaffold.json`** (which scaffold you
came from: origin URL + commit, and what you picked) and leaves three tools in
your project so you can change your mind later without hand-copying code:

| Tool                     | Purpose                                                        |
| ------------------------ | -------------------------------------------------------------- |
| `scripts/add.mjs`        | Enable a capability you skipped at init (auth, messaging, …)   |
| `scripts/new-app.mjs`    | Create a new app with a custom name (api / vite / next / expo) |
| `scripts/rename-app.mjs` | Rename an existing app everywhere (Dockerfile, railway, CI, …) |

> Naming starts correct: init derives each kept app's name from your project
> name (`<name>-api`, `<name>-web`, `<name>-mobile`) and rewrites every
> hardcoded reference — Dockerfile paths/CMD, `railway.json`, CI + image-scan
> matrices, project.json, docs — so nothing generic like "api" leaks into your
> images and deploys.

`add.mjs` and `new-app.mjs` never copy from your (possibly edited) project —
they download a **fresh, untouched copy of the scaffold** and copy from that,
so local changes can't corrupt what gets pulled in. The source is the origin
recorded in `.clevscaffold.json`, or explicitly:

```bash
--from ../ClevScaffold                 # a local clone (fastest, works offline)
--from git@github.com:clevrook/ClevScaffold.git
--ref  <sha|branch>                    # default: the commit you generated from
```

> By default they pin to the scaffold commit the project was generated from, so
> what you pull in matches what init would have given you. Pass `--ref main` to
> take the latest instead (review the diff — newer scaffold code may expect
> newer shared libs).

## Enable a capability later

```bash
node scripts/add.mjs --list                   # installed vs available
node scripts/add.mjs messaging                # implies auth if missing
node scripts/add.mjs compliance --from ../ClevScaffold
# capabilities: auth · messaging · realtime · feature-flags · metrics · compliance
```

What it does automatically: copies the capability's `libs/*` + app modules +
migrations (scope-renamed, with absent-capability sentinel blocks stripped),
re-adds tsconfig path aliases, app `package.json` deps, root scripts, and the
capability's `.env.example` keys, updates `.clevscaffold.json`, and runs
`npm install`.

**One manual step remains:** files you already own (`app.module.ts`, `main.ts`,
…) were sentinel-stripped at init and may have changed since — automatic merges
there would be guesswork. `add.mjs` instead writes **`docs/wiring-<capability>.md`**
with the exact lines to merge (imports / `load:` entries / `imports:` modules /
providers), mirroring the reference app. Apply it (this is a good agent task —
see `docs/agents/recipes.md`), then:

```bash
npm run migration:run && npm run verify
```

`tasks` is the reference-only demo and can't be added. Capabilities other than
`metrics` are TypeORM-coupled — a Prisma-only project can't take them.

## Create a new app (custom name)

```bash
node scripts/new-app.mjs --type api  --name billing --port 3002
node scripts/new-app.mjs --type vite --name storefront --port 5174
node scripts/new-app.mjs --type next --name admin --port 3006
node scripts/new-app.mjs --type expo --name driver-app
```

What you get:

- **`--type api`** — a **bare TypeORM core** NestJS app (`apps/<name>`): hardened
  `main.ts`, layered config, logger, `DatabaseModule`, health live/ready,
  throttler (Redis-optional), Dockerfile/railway wiring, health unit + e2e specs.
  No capabilities — wire the shared libs (`@<scope>/auth`, messaging, …) into it
  the same way `apps/api` does, or keep it lean. It joins the npm workspaces and
  the root `typecheck`. It **shares `DATABASE_URL` and `libs/database`
  migrations**; give it its own database via env/config when the service needs
  isolation. (A Prisma app generator doesn't exist yet — copy `apps/api-prisma`
  manually if you need one.)
- **`--type vite` / `--type next`** — a standalone web client (own lockfile)
  reduced to the health landing page, with the Docker/nginx or standalone-output
  wiring intact.
- **`--type expo`** — a standalone Expo app with the health screen, its own
  bundle identifiers derived from your project + app name.

Every type is **auto-registered**: root `dev:<name>` script, npm workspaces
(backend), tsconfig/eslint excludes (standalone apps), the CI docker + image-scan
matrices (docker-bearing apps), the security workflow's npm-audit matrix and a
Dependabot block (standalone apps). If an anchor can't be found (heavily edited
workflow files), the script prints the exact manual follow-up instead of
guessing.

Afterwards:

```bash
npm run dev:<name>
npx nx build <name> && npx nx lint <name>
```

## Rename an app

```bash
node scripts/rename-app.mjs --from my-app-api --to billing
```

Moves the directory and rewrites every hardcoded reference (boundary-safe —
renaming `x-api` never touches `x-api-prisma`): paths in Dockerfile/railway/
tsconfig/workflows/docs, bare Nx names (`nx build <app>`, CI `app:` matrices,
project.json, jest displayName), the `dev:<app>` script, and the package name.
`.clevscaffold.json`'s `appRenames` map is updated so `add.mjs` keeps landing
capability files in the right directory. Commit the result as one unit.

## How FUTURE scaffold libs reach existing projects

The scaffold keeps growing. The delivery contract:

1. **Every new scaffold lib ships as a capability** — an entry in
   `scripts/scaffold-manifest.mjs` (`CAPABILITIES` + `ALL_CAPS`, sentinels in
   the shared files, dirs/migrations/tsPaths/pkgDeps) plus a `--with-*` init
   flag. That single registration makes it: selectable at init, prunable by
   `--minimal`, and **installable into already-generated projects** by
   `add.mjs`.
2. **Existing projects discover and pull new capabilities** without upgrading
   anything else:

   ```bash
   node scripts/add.mjs --list --ref main     # what does the scaffold have now?
   node scripts/add.mjs realtime --ref main   # pull one that postdates my project
   ```

   `add.mjs` reads the capability manifest **from the fetched scaffold**, not
   your local copy — your project doesn't need to know a capability exists for
   it to be installable. Caveat: a newer capability may assume newer shared
   libs (`common`/`logger`/…); review the wiring guide and diff, and treat a
   large drift as a signal to diff those libs too.

3. **Authoring checklist** (scaffold repo, enforced by the init-matrix +
   evolve CI jobs): manifest entry · sentinel blocks balanced in every shared
   file · migration files if any · docs page + capability-table rows · both
   init smokes (kept + pruned) green · `add.mjs <cap>` on a minimal clone
   produces a working wiring guide.

## Rules for agents

- **Never hand-copy scaffold code** into a generated project when one of these
  tools covers it — run the tool, then apply its wiring guide.
- Treat `docs/wiring-<cap>.md` as the task spec: apply it exactly, run
  `npm run migration:run && npm run verify`, then delete the wiring file.
- Don't edit `.clevscaffold.json` by hand — the tools maintain it.
- These tools exist in generated projects only (`init.mjs` removes itself but
  keeps them). In the pristine scaffold everything is already present; only
  `new-app.mjs` is meaningful there (it uses the repo itself as the source).
