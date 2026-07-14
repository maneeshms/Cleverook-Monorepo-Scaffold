# Frontend (placeholder)

> The frontends in this scaffold are **wiring references**, not full applications.
> Deep frontend agent guidance (component architecture, state, design system,
> testing) will be added in a later iteration. For now, these rules apply.

## What `apps/web` and `apps/web-next` are for

They demonstrate **how a frontend plugs into this backend and ships** — not product
UI. Each carries its **own `package.json` + lockfile** (independent from the Nx
workspace) and its own Dockerfile + `railway.json`. What matters here is the wiring:
Docker build, nginx/standalone serving, env-based API URL, Railway config.

- **`apps/web`** — React + Vite. nginx image with an env-templated `/api` reverse
  proxy (`API_URL`). Same-origin API calls in the browser.
- **`apps/web-next`** — Next.js App Router, `output: 'standalone'`, 3-stage
  non-root Dockerfile, `/api/v1` rewrites.

Per user direction, the frontends have **no tests** — don't add a coverage gate or
unit suites here. The 90% floor applies to backend code only.

## Rules that still hold

- **Never put tokens/secrets in `localStorage`.** The Vite sample keeps tokens in
  module memory only. The production-grade pattern is httpOnly cookies via a BFF —
  documented, not yet implemented in the sample.
- **API base URL comes from the environment** (`VITE_API_URL` / Next env), never
  hardcoded. Prefer same-origin (`/api`) via the reverse proxy to avoid CORS.
- Exact-pinned dependencies + committed lockfile, same as the backend.
- Don't import backend libs (`@clevrook/*`) into a frontend — they're Node/Nest
  code. Share types by copying or a future shared contract package.

## When extending

Keep the wiring intact (Dockerfile stages, railway.json, env var names) — that's the
part the scaffold guarantees. Build product UI on top; revisit this doc when the
full frontend guidance lands.
