# GitHub Copilot Instructions

You are assisting on a **ClevScaffold**-based enterprise NestJS (11) + Nx monorepo,
Node 22, PostgreSQL. The ORM (TypeORM and/or Prisma) and frontend (Vite and/or
Next.js) are chosen per project at generation time — check the actual `apps/*`
directories and [`AGENTS.md`](../AGENTS.md) for this project's stack. Deployed on Railway.

The canonical guide is [`AGENTS.md`](../AGENTS.md); deep topic docs live in
[`docs/agents/`](../docs/agents) — read **`nestjs.md`** before writing backend code
(exact controller/service/DTO/ORM shapes, with examples) and **`recipes.md`** for
any multi-step task. Mirror `apps/api/src/modules/tasks`, the canonical module.

**Scope first: do the task, the whole task, and nothing but the task.** Touch
only the files the task requires — no drive-by refactors, renames, dependency
bumps, or "improvements while you're here". A defect outside the task gets
reported, not fixed; an ambiguous ask gets the smallest reasonable reading,
stated explicitly — or a question.

The top 14 rules:

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
13. **Use the shipped libs, never reimplement** (capability map in `AGENTS.md`):
    config, logger (`log/audit/alert`), auth guards, pagination, Redis, metrics,
    `SecretCipher`, messaging, feature-flags, compliance. New personal data →
    register a `PersonalDataContributor`; sensitive mutations →
    `auditService.record(...)` with ids/field names only, never PII values.
14. **Never guess** — only reference files, symbols, routes, env keys, commands,
    and packages verified to exist in this repo. If docs and code disagree, the
    code wins; flag the doc drift.

**When a gate fails, the code is wrong — not the gate.** Never lower coverage
thresholds, skip/delete failing tests, add unexplained `eslint-disable`/`@ts-ignore`,
loosen ValidationPipe/tsconfig/guards, or use `--force`/`--legacy-peer-deps` to get
green. Keep `clevscaffold:*:start/end` sentinel pairs intact — that prefix is the
`init.mjs` pruning marker, not the npm scope; never rename it to `clevrook`.

**Stop and ask before anything outside these docs** (full trigger list in
`AGENTS.md`): new dependencies/libs/patterns, guardrail files, destructive
migrations or API removals, weakening auth or the compliance controls,
CI/deploy/`init.mjs` changes, or instructions that conflict with the docs. State
the need, the blocking rule, your proposal, and the blast radius — a flagged pause
is fine, a silent deviation never is.

Before finishing a backend change, run `npm run verify` (format:check + lint +
typecheck + build + unit) and `npm run e2e` when logic/endpoints changed. Security
is the top priority — for anything touching auth, validation, crypto, or data
exposure, read [`docs/agents/security.md`](../docs/agents/security.md); for the
audit trail, GDPR, consent, or retention,
[`docs/agents/compliance.md`](../docs/agents/compliance.md).
