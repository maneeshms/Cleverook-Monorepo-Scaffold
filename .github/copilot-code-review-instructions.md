# Copilot Code Review Instructions

You are reviewing code for a **ClevScaffold**-based enterprise NestJS + Nx monorepo
(Node 22, PostgreSQL). The ORM (TypeORM and/or Prisma) and frontend (Vite and/or
Next.js) are selected per project — check the actual `apps/*` directories for this
project's stack. Deployed on Railway. Full standards:
[`AGENTS.md`](../AGENTS.md) and [`docs/agents/`](../docs/agents). Enforce the rules
below on every PR.

## Dependency management

- Flag any version using `^`, `~`, or a range — deps must be exact-pinned.
- Flag a `package.json` change without the matching lockfile update.

## Naming

- TS: classes/interfaces `PascalCase`, functions/vars `camelCase`, module consts
  `SCREAMING_SNAKE_CASE`, enums `PascalCase` name + `SCREAMING_SNAKE_CASE` members,
  booleans prefixed `is`/`has`/`can`.
- Files `kebab-case.ts`; tests `*.spec.ts`; modules `<feature>.module.ts`; DTOs
  `<action>-<resource>.dto.ts`. Prisma models `PascalCase` singular; migrations `snake_case`.

## Code style

- Flag `any` — suggest `unknown` + narrowing.
- Flag `console.log`/`console.error` in app code (not `*.spec.ts`) — use `LoggerService`.
- Flag direct `process.env` outside `libs/config`, `main.ts`, `app.module.ts`,
  `data-source.ts`, `prisma/seed.ts` — use `ConfigService`.
- Flag exported functions/methods missing explicit return types; multiple classes per file;
  `@ts-ignore`/`@ts-expect-error` without justification.

## NestJS

- Flag controllers injecting a repository or `PrismaService` directly.
- Flag manual validation instead of `class-validator` DTOs; DTOs missing decorators.
- Flag endpoints missing `@ApiTags`/`@ApiOperation`/`@ApiResponse`, or not under `/api/v1`.
- Flag thrown errors that aren't NestJS `HttpException` subclasses.
- Flag business logic or authorization implemented in controllers instead of services.

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

## Testing

- Flag new service methods / endpoints without a corresponding `*.spec.ts`.
- Flag changes that would drop coverage below the 90% floor.
- Flag unit tests making real network/DB calls (must be mocked); vague names (`test('works')`);
  test files in `__tests__/` instead of co-located.

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
