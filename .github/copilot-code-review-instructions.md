# Copilot Code Review Instructions

You are reviewing code for a **ClevScaffold**-based enterprise NestJS + Nx monorepo
(Node 22, PostgreSQL, TypeORM). The frontend (Vite and/or
Next.js) is selected per project — check the actual `apps/*` directories for this
project's stack. Deployed on Railway. Full standards:
[`AGENTS.md`](../AGENTS.md) and [`docs/agents/`](../docs/agents) — backend shapes in
`docs/agents/nestjs.md` (mirror `modules/tasks`). Enforce the rules below on every PR.

## Dependency management

- Flag any version using `^`, `~`, or a range — deps must be exact-pinned.
- Flag a `package.json` change without the matching lockfile update.

## Naming

- TS: classes/interfaces `PascalCase`, functions/vars `camelCase`, module consts
  `SCREAMING_SNAKE_CASE`, enums `PascalCase` name + `SCREAMING_SNAKE_CASE` members,
  booleans prefixed `is`/`has`/`can`.
- Files `kebab-case.ts`; tests `*.spec.ts`; modules `<feature>.module.ts`; DTOs
  `<action>-<resource>.dto.ts`.

## Code style

- Flag `any` — suggest `unknown` + narrowing.
- Flag `console.log`/`console.error` in app code (not `*.spec.ts`) — use `LoggerService`.
- Flag direct `process.env` outside `libs/config`, `main.ts`, `app.module.ts`,
  `data-source.ts` — use `ConfigService`.
- Flag exported functions/methods missing explicit return types; multiple classes per file;
  `@ts-ignore`/`@ts-expect-error` without justification.

## NestJS

- Flag controllers injecting a repository directly.
- Flag manual validation instead of `class-validator` DTOs; DTOs missing decorators.
- Flag endpoints missing `@ApiTags`/`@ApiOperation`/`@ApiResponse`, or not under `/api/v1`.
- Flag thrown errors that aren't NestJS `HttpException` subclasses.
- Flag business logic or authorization implemented in controllers instead of services.
- Flag reimplementation of a shipped lib capability (logging, pagination, Redis clients,
  metrics registries, crypto, outbound messaging, feature gating, audit tables) —
  the `libs/` version must be used (capability map in AGENTS.md).

## Security (top priority — see docs/agents/security.md)

- Flag any hardcoded secret/token/password/API key/DB URL (source, tests, comments, YAML).
- Flag logging of sensitive values (JWT, password/hash, refresh token, API key, DB URL).
- Flag endpoints missing a guard and not marked `@Public()`.
- Flag trusting `userId`/`ownerId`/`companyId` from the request body — must come from the JWT.
- Flag role/permission checks inline in controllers instead of the service layer.
- Flag raw SQL string concatenation (require query builder / parameterized `$queryRaw`).
- Flag missing global `ValidationPipe` (`whitelist` + `forbidNonWhitelisted`), or DTOs that
  accept privileged fields (mass assignment).
- Flag `synchronize: true`, or schema changes outside migrations.
- Flag CORS `*` combined with credentials; responses that leak stack traces/internals;
  DTOs/handlers that return entities with secret fields (`passwordHash`, token hashes).
- Flag secrets placed in `config/*.json` (they belong in env only).
- Flag GitHub Actions hardcoding credentials instead of `${{ secrets.* }}`, or third-party
  actions pinned to a mutable tag when a SHA is warranted.

## Compliance (audit trail · GDPR · consent · retention — see docs/agents/compliance.md)

- Flag any update or delete path added to `AuditLog`/`audit_log` (the retention purge
  is the only exception) — the trail is append-only.
- Flag changes to the audit hash-chain (`payload()`, `computeChainHash`, `verifyChain`)
  that don't keep write and verify paths in sync, or that add DB-generated fields
  (e.g. `sequence`) to the hash.
- Flag PII, tokens, or secret values in audit `metadata` — ids, counts, and field
  names only.
- Flag GDPR erasure implemented as a bare soft delete that leaves email/name behind
  (Art. 17 requires anonymisation/tombstone or hard delete).
- Flag new modules/entities storing user-attributable data without a matching
  `PersonalDataContributor` registration (and `RetentionTarget` if the data ages out).
- Flag `libs/compliance` importing a feature module (must stay registry-driven), or
  retention windows defaulted to `0`/keep-forever without justification.
- Flag hand-rolled audit/history tables where `AuditService.record(...)` should be used.

## Testing

- Flag new service methods / endpoints without a corresponding `*.spec.ts`.
- Flag changes that would drop coverage below the 90% floor.
- Flag unit tests making real network/DB calls (must be mocked); vague names (`test('works')`);
  test files in `__tests__/` instead of co-located.

## Gate integrity (highest scrutiny — these are how quality erodes)

- Flag ANY edit to `jest.preset.js` coverage thresholds, coverage excludes,
  `eslint.config.mjs` rule removals, `.npmrc`, or `tsconfig` loosening — unless the
  PR is explicitly about tooling and justifies it.
- Flag `.skip`/`.only` on tests, deleted failing tests, or assertions weakened to
  make a change pass.
- Flag new `eslint-disable`, `@ts-ignore`/`@ts-expect-error`, or `as any` without a
  one-line justification comment on the same line/block.
- Flag `--force`/`--legacy-peer-deps` in scripts/docs/CI, or a regenerated lockfile
  with no corresponding `package.json` change.
- Flag weakened ValidationPipe options, removed guards, loosened CORS/helmet, or
  raised body-size/throttle limits without explicit justification.

## Git & infra

- Flag commit messages not following Conventional Commits.
- Note PRs over ~400 lines and suggest splitting.
- Flag `Dockerfile`/`docker-compose.yml` changes for extra scrutiny; new compose services
  missing a `healthcheck`; new env vars not documented in `.env.example`.
- Flag edits that break `clevscaffold:*:start/end` sentinel comment pairs (init.mjs pruning).

## What NOT to flag

- Formatting/whitespace (Prettier owns it).
- Style preferences where the code matches its surroundings.
- Issues already caught by ESLint / the TypeScript compiler.
- Absence of tests in the frontend app(s) (`apps/web*` — wiring-only, no tests).
