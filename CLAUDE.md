# CLAUDE.md

The canonical guide for this repo is **[AGENTS.md](AGENTS.md)** — read it first.

@AGENTS.md

## Before you touch code

Read the topic doc that matches your task (all under `docs/agents/`):

- **nestjs.md** — any backend code: the exact module/controller/service/DTO/ORM
  shapes with code examples. `modules/tasks` is the canonical module to mirror.
- **recipes.md** — any multi-step task: add a module, endpoint, migration,
  config key, dependency; the special protocol for touching auth.
- **security.md** — any auth, validation, crypto, data-exposure, or endpoint
  change. Security is the top priority; when unsure, read it.
- **compliance.md** — the audit trail, GDPR export/erasure, consent, retention
  (`libs/compliance`); also whenever a module stores personal data.
- **architecture.md** — adding a lib/app, lib boundaries, workspaces, lean Docker.
- **conventions.md** — naming, types, Swagger, commits, style.
- **testing.md** — writing tests, the ≥90% coverage floor, e2e, the scanner.
- **workflows.md** — branching, PRs, CI gates, migrations, deploys.
- **frontend.md** — anything under `apps/web` or `apps/web-next`.

## Non-negotiables (full list + reasons in AGENTS.md)

- Ship tests with every code change; keep coverage **≥ 90%**. Prove done with
  `npm run verify` (plus `npm run e2e` for backend behaviour) and the AGENTS.md
  self-audit checklist.
- No secrets in code/JSON/logs. No direct `process.env`. No `any`. Exact-pinned
  deps in the package that imports them (never the root).
- Guards by default; derive identity from the JWT, never the request body.
  BOLA-safe 404s in services (see nestjs.md §3).
- **Use the shipped libs** (capability map in AGENTS.md) — config, logger, auth,
  pagination, Redis, metrics, crypto, messaging, flags, compliance. Reimplementing
  one is a defect. New personal data → register a `PersonalDataContributor`;
  sensitive mutations → `auditService.record(...)` (no PII in metadata).
- **Never guess** — verify every file, symbol, route, env key, command, and
  package against the repo before referencing it; if the docs and code disagree,
  the code wins and you flag the drift.
- **When a gate fails, the code is wrong — not the gate.** Never lower coverage,
  skip/delete tests, add unexplained `eslint-disable`/`@ts-ignore`, loosen
  ValidationPipe/tsconfig, or use `--force`/`--legacy-peer-deps` to get green.
- **Stop and ask** (full trigger list in AGENTS.md) before anything outside these
  docs: new deps/libs/patterns, guardrail files, destructive migrations or API
  removals, auth/compliance weakening, CI/deploy/init changes, or conflicting
  instructions. Ask with: need, blocking rule, proposal, blast radius. A flagged
  pause is fine; a silent deviation never is.
- Keep `clevscaffold:*:start/end` sentinel comment pairs intact — `init.mjs`
  prunes on them; breaking a pair breaks generated projects. The `clevscaffold:`
  prefix is the pruning marker, **not** the npm scope — never rename it to
  `clevrook`.
