# GitHub Copilot Instructions

You are assisting on **ClevScaffold** — an enterprise NestJS (10) + Nx monorepo,
Node 22, PostgreSQL, with **two ORMs** (TypeORM in `apps/api`, Prisma in
`apps/api-prisma`) and two frontends (Vite, Next.js). Deployed on Railway.

The canonical guide is [`AGENTS.md`](../AGENTS.md); deep topic docs live in
[`docs/agents/`](../docs/agents). Follow them. The top 12 rules:

1. **Every code change ships with tests; coverage must stay ≥ 90%** (jest enforces it).
2. **No secrets** in source, tests, comments, JSON config, or YAML — env only, never logged.
3. **No direct `process.env`** in app/lib code — use `ConfigService` / typed namespaces.
4. **No `any`** — use `unknown` + narrowing; explicit return types on exports; one class per file.
5. **Exact-pinned dependencies** (no `^`/`~`); update the lockfile with `package.json`.
6. **Guards by default** — authenticate every endpoint; opt out only with `@Public()`.
7. **Derive identity from the JWT**, never from the request body (BOLA/IDOR defense).
8. **Validated DTOs** on every body/query; global `ValidationPipe` whitelist +
   forbidNonWhitelisted. Controllers stay thin — logic + authorization in services.
9. **Swagger decorators** on every endpoint; routes under `/api/v1`; throw NestJS
   `HttpException` subclasses.
10. **Parameterized queries only**; migrations-only schema (no `synchronize`).
11. **No mock/fake data** — real providers, explicit fallback or 503 when unconfigured.
12. **Config is layered:** `process.env` → `config/{NODE_ENV}.json` →
    `config/default.json` → code default. Secrets never in JSON.

Before finishing a backend change, run `npm run lint && npm run typecheck &&
npm run build && npm run test` (and `npm run e2e` when logic/endpoints changed).
Security is the top priority — for anything touching auth, validation, crypto, or
data exposure, read [`docs/agents/security.md`](../docs/agents/security.md).
