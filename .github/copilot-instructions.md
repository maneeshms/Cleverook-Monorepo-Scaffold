# GitHub Copilot Instructions

You are assisting on a **ClevScaffold**-based enterprise NestJS (11) + Nx monorepo,
Node 22, PostgreSQL. The ORM (TypeORM and/or Prisma) and frontend (Vite and/or
Next.js) are chosen per project at generation time — check the actual `apps/*`
directories and [`AGENTS.md`](../AGENTS.md) for this project's stack. Deployed on Railway.

The canonical guide is [`AGENTS.md`](../AGENTS.md); deep topic docs live in
[`docs/agents/`](../docs/agents) — read **`nestjs.md`** before writing backend code
(exact controller/service/DTO/ORM shapes, with examples) and **`recipes.md`** for
any multi-step task. Mirror `apps/api/src/modules/tasks`, the canonical module.
The top 12 rules:

1. **Every code change ships with tests; coverage must stay ≥ 90%** (jest enforces it).
2. **No secrets** in source, tests, comments, JSON config, or YAML — env only, never logged.
3. **No direct `process.env`** in app/lib code — use `ConfigService` / typed namespaces.
4. **No `any`** — use `unknown` + narrowing; explicit return types on exports; one class per file.
5. **Exact-pinned dependencies** (no `^`/`~`), added to the package that imports
   them (never the root); update the lockfile with `package.json`.
6. **Guards by default** — authenticate every endpoint; opt out only with `@Public()`.
7. **Derive identity from the JWT**, never from the request body (BOLA/IDOR defense);
   ownership checks live in services with the BOLA-safe 404 (missing and not-yours
   both return 404 — never a 403 that confirms the id exists).
8. **Validated DTOs** on every body/query; global `ValidationPipe` whitelist +
   forbidNonWhitelisted. Controllers stay thin — logic + authorization in services;
   never inject a repository/PrismaService into a controller.
9. **Swagger decorators** on every endpoint; routes under `/api/v1`; throw NestJS
   `HttpException` subclasses.
10. **Parameterized queries only**; migrations-only schema (no `synchronize`).
11. **No mock/fake data** — real providers, explicit fallback or 503 when unconfigured.
12. **Config is layered:** `process.env` → `config/{NODE_ENV}.json` →
    `config/default.json` → code default. Secrets never in JSON.

**When a gate fails, the code is wrong — not the gate.** Never lower coverage
thresholds, skip/delete failing tests, add unexplained `eslint-disable`/`@ts-ignore`,
loosen ValidationPipe/tsconfig/guards, or use `--force`/`--legacy-peer-deps` to get
green. If a rule genuinely blocks the task, surface the conflict explicitly instead
of deviating silently. Keep `clevscaffold:*:start/end` sentinel pairs intact.

Before finishing a backend change, run `npm run verify` (lint + typecheck + build +
unit) and `npm run e2e` when logic/endpoints changed. Security is the top priority —
for anything touching auth, validation, crypto, or data exposure, read
[`docs/agents/security.md`](../docs/agents/security.md).
