# Frontend & mobile (placeholder)

> The frontends and the mobile app in this scaffold are **wiring references**, not
> full applications. Deep agent guidance (component architecture, state, design
> system, testing) will be added in a later iteration. For now, these rules apply.

## What `apps/web`, `apps/web-next`, and `apps/mobile` are for

They demonstrate **how a client plugs into this backend and ships** — not product
UI. Each carries its **own `package.json` + lockfile** (independent from the Nx
workspace). What matters here is the wiring: env-based API URL, auth/token
handling appropriate to the platform, and the ship path (Docker for web, EAS/app
stores for mobile).

- **`apps/web`** — React + Vite. nginx image with an env-templated `/api` reverse
  proxy (`API_URL`). Same-origin API calls in the browser.
- **`apps/web-next`** — Next.js App Router, `output: 'standalone'`, 3-stage
  non-root Dockerfile, `/api/v1` rewrites.
- **`apps/mobile`** — Expo React Native (see `docs/MOBILE.md`). Access token in
  memory, rotating refresh token in the OS keychain (`expo-secure-store`),
  single-flight silent refresh, push-device registration against
  `/notifications/devices`. No Dockerfile — it ships through EAS/app stores.

Per user direction, the frontends and the mobile app have **no tests** — don't add
a coverage gate or unit suites here. The 90% floor applies to backend code only.

## Rules that still hold

- **Never put tokens/secrets in `localStorage`.** The Vite sample keeps tokens in
  module memory only. The production-grade pattern is httpOnly cookies via a BFF —
  documented, not yet implemented in the sample.
- **On mobile, never put tokens in `AsyncStorage`** (plaintext on disk). The Expo
  sample keeps the access token in memory and the refresh token in
  `expo-secure-store` (Keychain/Keystore) — keep that split when extending it.
- **API base URL comes from the environment** (`VITE_API_URL` / Next env /
  `EXPO_PUBLIC_API_URL`), never hardcoded. On web prefer same-origin (`/api`) via
  the reverse proxy to avoid CORS; a device has no proxy, so mobile calls the API
  URL directly.
- Exact-pinned dependencies + committed lockfile, same as the backend. One
  deliberate exception: `apps/mobile` keeps Expo's `~` ranges on `expo-*` /
  `react-native` — the Expo SDK owns those versions; bump them with
  `npx expo install` (never plain `npm install <pkg>@latest`).
- Don't import backend libs (`@clevrook/*`) into a frontend or the mobile app —
  they're Node/Nest code. Share types by copying or a future shared contract
  package.

## When extending

Keep the wiring intact (Dockerfile stages, railway.json, env var names, the mobile
token-storage split) — that's the part the scaffold guarantees. Build product UI on
top; revisit this doc when the full frontend guidance lands.
