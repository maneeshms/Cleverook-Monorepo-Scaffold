# Design System — the Clevrook Design Kit

Every user interface in a ClevScaffold project is built with the **Clevrook
Design Kit** ([github.com/clevrook/clevrook-design-kit](https://github.com/clevrook/clevrook-design-kit)).
This is not a suggestion or a starting point — it is the UI layer of the
scaffold, wired into `apps/web`, `apps/web-next`, and `apps/mobile` out of the
box, and it stays wired in `--minimal` projects and in apps created by
`scripts/new-app.mjs`.

**The rule, in one line:** build UI from kit components and kit tokens; anything
the kit does not provide must be built _on_ the kit, never beside it.

## Packages

| Package            | Used by                     | What it gives you                               |
| ------------------ | --------------------------- | ----------------------------------------------- |
| `@clevrook/tokens` | all                         | primitives → semantic → component tokens        |
| `@clevrook/theme`  | all                         | `ThemeProvider`, `WebThemeProvider`, `useTheme` |
| `@clevrook/icons`  | all (via `web`/`native`)    | Lucide wrappers with token-driven colors        |
| `@clevrook/web`    | `apps/web`, `apps/web-next` | 37 React DOM components                         |
| `@clevrook/native` | `apps/mobile`               | the same 37 components for React Native         |

Token flow — change a primitive and everything downstream follows:

```
Primitives  →  Semantic  →  Component  →  UI components
(raw values)   (intent)     (per-component)  (@clevrook/web · @clevrook/native)
```

## The rules

1. **Use kit components.** If `@clevrook/web` / `@clevrook/native` exports it,
   use it. Do not hand-roll a button, input, modal, table, or toast.
2. **Never hardcode a design value.** No hex colors, font sizes, font families,
   radii, shadows, or spacing numbers in app code. They come from tokens, via
   components or `useTheme()`.
3. **Anything outside the kit must be compatible with the kit.** A layout
   wrapper, a chart, a map, a third-party widget — all of it reads its colors,
   typography, spacing, and radii from `useTheme()` so it re-themes with
   everything else. A component that ignores the tokens is a defect even if it
   looks right today.
4. **Brand only in `src/theme/brand.ts`.** One file per app, spreading
   `defaultPrimitives`. Never edit `node_modules/@clevrook/*`.
5. **Missing something? Raise it, don't fork it.** A gap in the kit is a
   design-kit issue, not a licence to write bespoke CSS. If you must ship before
   the kit catches up, build it from tokens and flag it as temporary.
6. **CSS files carry document-level reset only.** `apps/web/src/styles.css` and
   `apps/web-next/src/app/globals.css` set `body { margin: 0 }` and nothing else.

Layout is the one thing you write yourself — flexbox direction, `flex: 1`,
`maxWidth`. Those carry no design decisions. Use `Box` for anything with
_spacing_, so the value lands on the token scale.

## Access — the packages are private

The kit is published to **GitHub Packages**, not the public npm registry. Each
client app ships an `.npmrc` that routes only the `@clevrook` scope there — and
**no credential**:

```ini
@clevrook:registry=https://npm.pkg.github.com
```

> **The token must NOT go in that file, and `export GITHUB_TOKEN=…` will not
> work.** pnpm deliberately refuses to expand environment variables in registry
> credentials that come from a project `.npmrc`, because that file is committed
> and a rewritten registry line could ship your token to an attacker-controlled
> host. A `${GITHUB_TOKEN}` placeholder there is silently ignored and the install
> 401s. (npm expands it; pnpm does not — this bites people migrating.)

Every developer configures the credential **once**, in their user-level config:

```bash
# GitHub → Settings → Developer settings → Personal access tokens (classic)
# Scope: read:packages   ·   SSO orgs: click "Configure SSO" → authorize `clevrook`
pnpm config set "//npm.pkg.github.com/:_authToken" ghp_your_token   # writes ~/.npmrc
pnpm install                                                        # in any client app
```

`pnpm run doctor` checks that it is configured (presence only — it never reads or
prints the value).

> **The backend needs no token.** Only the client apps resolve `@clevrook` from
> GitHub Packages — the root workspace's own `@clevrook/*` libs are local
> workspace packages and never hit a registry.

### CI and Docker

Both inject the credential at the user level, for the same reason.

- **CI** — the `docker` job in `ci.yml` and the `audit` job in `security.yml`
  request `packages: read`. The audit job runs `pnpm config set` from
  `secrets.DESIGN_KIT_TOKEN || secrets.GITHUB_TOKEN` before installing; the
  runner is discarded afterwards. The automatic `GITHUB_TOKEN` works once the
  packages grant this repo access (Package settings → Manage Actions access);
  otherwise add a `DESIGN_KIT_TOKEN` repo secret holding a PAT with
  `read:packages`.
- **Docker** — both client Dockerfiles mount the token as a BuildKit secret,
  write it to `/root/.npmrc`, install, and delete it **inside a single `RUN`**, so
  it never becomes part of a layer or the image history:

  ```bash
  export GITHUB_TOKEN=ghp_…
  docker build --secret id=github_token,env=GITHUB_TOKEN \
    -f apps/web/Dockerfile -t my-app-web .
  ```

  Never pass it as `--build-arg` — build args are recorded in the image. Never
  split the install and the `rm` into separate `RUN` steps — that leaves the
  token in a layer.

## Setup per app (already done in the scaffold)

### `apps/web` (Vite)

`src/main.tsx` loads the fonts and wraps the tree:

```tsx
import '@fontsource/plus-jakarta-sans/400.css'; // + 500, 600
import '@fontsource/rubik/400.css'; // + 500
import { WebThemeProvider } from '@clevrook/theme/web';
import { brandPrimitives } from './theme/brand';

<WebThemeProvider primitives={brandPrimitives} mode="light" style={{ minHeight: '100vh' }}>
  <App />
</WebThemeProvider>;
```

### `apps/web-next` (Next.js App Router)

The provider is a Client Component (`src/app/providers.tsx`) because kit
components use hooks; `layout.tsx` stays a Server Component and wraps its
children in it. Pages that render kit components are client components, or —
as in `page.tsx` — a server component that fetches and hands data to a client
child (`home-content.tsx`).

### `apps/mobile` (Expo)

`App.tsx` gates rendering on `useFonts(...)`, then wraps in `ThemeProvider`.

**Native fonts need a mapping.** The kit's `fontFamily` primitives are CSS font
stacks; React Native needs one registered face name and silently falls back to
the system font otherwise. `apps/mobile/src/theme/brand.ts` therefore overrides
`typography.fontFamily` with the exact keys registered in `useFonts` — keep the
two in sync. The web apps need no such override.

## Per-project branding

Each product overrides tokens in its own `src/theme/brand.ts`:

```ts
import { defaultPrimitives, type PrimitiveTokens } from '@clevrook/tokens';

export const brandPrimitives: PrimitiveTokens = {
  ...defaultPrimitives,
  colors: {
    ...defaultPrimitives.colors,
    brand: { ...defaultPrimitives.colors.brand, 500: '#EA580C', 600: '#C2410C' },
  },
};
```

Ten projects, ten `brand.ts` files, one shared package — no cross-project impact.
The full override reference ships with the package:
`node_modules/@clevrook/tokens/docs/PROJECT_BRANDING.md`.

## Reference

- **Storybook** — `pnpm storybook` in the design-kit repo (browser, all web
  components, light/dark toggle, a11y checks, copyable code) and
  `pnpm storybook:native` (on-device, Expo).
- **Component list** — `@clevrook/web` and `@clevrook/native` export the same 37
  components: `Text` `Box` `Button` `TextInput` `Checkbox` `Switch` `Label`
  `FormField` `TextArea` `Select` `Radio` `Link` `Alert` `Spinner` `Badge`
  `Card` `Avatar` `Divider` `Skeleton` `Tabs` `Tooltip` `Modal` `Drawer`
  `Breadcrumb` `Menu` `Navbar` `Pagination` `Table` `Toast` `Progress`
  `Accordion` `SearchInput` `Chip` `Rating` `ImageCard` `EmptyState` `Icon`.
- **The scaffold's own examples** — `apps/web/src/App.tsx` (auth + tasks) and
  `apps/mobile/App.tsx` are written to be copied from.

## The scope collision (why `init.mjs` treats `@clevrook` specially)

The design kit publishes under `@clevrook/*` — the same scope this scaffold uses
for its own libs. `scripts/init.mjs` rewrites `@clevrook` to your project's scope,
so `scripts/scaffold-manifest.mjs` exports `DESIGN_KIT_PACKAGES` and
`renameScopeInText()` skips those five specifiers (and the `.npmrc` registry
key). Consequence for scaffold maintainers: **never name a lib `tokens`,
`theme`, `icons`, `web`, or `native`** — it would be silently exempted from the
rename and break every generated project.
