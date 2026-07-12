# CLAUDE.md

The canonical guide for this repo is **[AGENTS.md](AGENTS.md)** — read it first.

@AGENTS.md

## Before you touch code

Read the topic doc that matches your task (all under `docs/agents/`):

- **security.md** — any auth, validation, crypto, data-exposure, or endpoint change.
  Security is the top priority; when unsure, read it.
- **architecture.md** — adding a module/lib/app, layered config, lib boundaries.
- **conventions.md** — naming, types, Swagger, commits, style.
- **testing.md** — writing tests, the ≥90% coverage floor, e2e, the scanner.
- **workflows.md** — branching, PRs, CI gates, migrations, deploys.
- **frontend.md** — anything under `apps/web` or `apps/web-next`.

## Non-negotiables (full list in AGENTS.md)

- Ship tests with every code change; keep coverage **≥ 90%**. Run
  `npm run lint && npm run typecheck && npm run build && npm run test` (plus
  `npm run e2e` for backend logic) before declaring done.
- No secrets in code/JSON/logs. No direct `process.env`. No `any`. Exact-pinned deps.
- Guards by default; derive identity from the JWT, never the request body.
- Keep `clevscaffold:*:start/end` sentinel comment pairs intact — `init.mjs` prunes on them.
