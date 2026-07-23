# Frontend & mobile

> The frontends and the mobile app in this scaffold are **wiring references**, not
> full applications. Deep guidance on component architecture, state, and testing
> will be added in a later iteration. The **design system** section below is not a
> placeholder — it is binding.

## The design system is mandatory

**All UI is built with the Clevrook Design Kit (`@clevrook/tokens` · `theme` ·
`icons` · `web` · `native`).** Full guide: [../DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md).
It is already wired into `apps/web`, `apps/web-next`, and `apps/mobile`, and it
stays wired in `--minimal` projects and in apps made by `scripts/new-app.mjs`.

Follow it strictly:

- **Use a kit component if one exists.** `@clevrook/web` and `@clevrook/native`
  both export the same 37 components — `Text` `Box` `Button` `TextInput`
  `Checkbox` `Switch` `Label` `FormField` `TextArea` `Select` `Radio` `Link`
  `Alert` `Spinner` `Badge` `Card` `Avatar` `Divider` `Skeleton` `Tabs`
  `Tooltip` `Modal` `Drawer` `Breadcrumb` `Menu` `Navbar` `Pagination` `Table`
  `Toast` `Progress` `Accordion` `SearchInput` `Chip` `Rating` `ImageCard`
  `EmptyState` `Icon`. Hand-rolling one of these is a defect, exactly like
  reimplementing a shipped backend lib.
- **Never hardcode a design value** — no hex colors, font sizes, font families,
  radii, shadows, or spacing numbers in app code. They come from tokens, through
  components or `useTheme()`.
- **Anything outside the kit must be compatible with the kit.** A chart, a map, a
  third-party widget, a bespoke layout — it reads colors, typography, spacing,
  and radii from `useTheme()` so it re-themes with everything else. A component
  that renders correctly but ignores the tokens is still wrong.
- **Brand only in `src/theme/brand.ts`** (one per app, spreading
  `defaultPrimitives`). Never edit `node_modules/@clevrook/*`.
- **CSS files are document reset only** — `apps/web/src/styles.css` and
  `apps/web-next/src/app/globals.css` set `body { margin: 0 }` and nothing more.
- **A gap in the kit is a stop-and-ask**, not permission to write bespoke CSS.
  Report it; if you must ship first, build it from tokens and flag it as
  temporary.

Layout is the one thing you write by hand — flex direction, `flex: 1`,
`maxWidth`, `margin: '0 auto'`. Those carry no design decisions. Anything with
_spacing_ goes through `Box`, so the value lands on the token scale.

Copy the shape from `apps/web/src/App.tsx` (web) or `apps/mobile/App.tsx`
(native) — both are written to be copied from.

### Platform notes that bite

- **Next.js App Router:** kit components use hooks, so they need a Client
  Component boundary. `src/app/providers.tsx` holds the provider; `layout.tsx`
  stays a Server Component. A server page that needs kit UI fetches data and
  hands it to a client child (see `page.tsx` → `home-content.tsx`).
- **React Native fonts:** the kit's `fontFamily` primitives are CSS font stacks,
  which RN cannot resolve — it silently falls back to the system font. So
  `apps/mobile/src/theme/brand.ts` overrides `typography.fontFamily` with the
  exact keys registered by `useFonts` in `App.tsx`. Change one, change both. The
  web apps need no such override.
- **The packages are private.** `pnpm install` in a client app needs a
  `read:packages` token, configured **user-level** — `pnpm config set
"//npm.pkg.github.com/:_authToken" <token>`. Do not add it to the app's
  `.npmrc`: pnpm ignores credentials from a committed project file and will 401
  without explanation. `pnpm run doctor` warns when it's missing; the backend
  workspace needs no token. Details in
  [../DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md).

## What `apps/web`, `apps/web-next`, and `apps/mobile` are for

They demonstrate **how a client plugs into this backend and ships** — not product
UI. Each carries its **own `package.json` + lockfile** (independent from the Nx
workspace). What matters here is the wiring: env-based API URL, auth/token
handling appropriate to the platform, the design system, and the ship path
(Docker for web, EAS/app stores for mobile).

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
  `pnpm exec expo install` (never plain `pnpm add <pkg>@latest`).
- Don't import backend libs into a frontend or the mobile app — they're Node/Nest
  code. Note that after `init.mjs` the backend libs carry **your** scope while the
  design kit keeps `@clevrook`: `@myco/logger` is a backend lib (off-limits here),
  `@clevrook/web` is the design kit (required here). Share types by copying or a
  future shared contract package.

## When extending

Keep the wiring intact (Dockerfile stages, railway.json, env var names, the mobile
token-storage split, the theme provider at the root) — that's the part the
scaffold guarantees. Build product UI on top **with the design kit**; revisit this
doc when the full frontend guidance lands.
