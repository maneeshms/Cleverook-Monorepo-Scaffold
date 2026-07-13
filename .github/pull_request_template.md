<!-- Conventional-Commits title, e.g. "feat(tasks): add bulk complete endpoint" -->

## What & why

<!-- One or two sentences: the change and the reason. Link the issue/design note if any. -->

## Checklist (the golden rules — AGENTS.md)

- [ ] Tests ship with the change; coverage stays **≥ 90%** (`npm run test`)
- [ ] `npm run verify` green (lint + typecheck + build + unit)
- [ ] e2e run for backend/endpoint changes (`npm run e2e`)
- [ ] No secrets in code/JSON/YAML; no direct `process.env` outside the allowlist
- [ ] Dependencies exact-pinned; lockfile updated with `package.json`
- [ ] New endpoints guarded (or explicitly `@Public()`) + Swagger-decorated
- [ ] New env vars documented in `.env.example`
- [ ] `clevscaffold:*:start/end` sentinel pairs kept intact and balanced
- [ ] Migrations only for schema changes (no `synchronize`), expand/contract-safe

## Notes for the reviewer

<!-- Risk areas, follow-ups, anything you want eyes on. Keep PRs under ~400 lines where possible. -->
