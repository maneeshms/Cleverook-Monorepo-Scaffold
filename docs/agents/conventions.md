# Conventions

House style for all TypeScript in this repo. Match the surrounding code first;
these rules resolve ambiguity. For the full NestJS shapes with code examples,
see [`nestjs.md`](nestjs.md); for step-by-step task recipes, [`recipes.md`](recipes.md).

## Naming

- **Types:** classes/interfaces/enums `PascalCase`. Enum members `SCREAMING_SNAKE_CASE`.
- **Values:** functions/variables `camelCase`. Module-level constants `SCREAMING_SNAKE_CASE`.
- **Booleans:** prefix `is` / `has` / `can`.
- **Files:** `kebab-case.ts`. Tests `*.spec.ts` (co-located). NestJS: `<feature>.module.ts`,
  `<feature>.service.ts`, `<feature>.controller.ts`. DTOs `<action>-<resource>.dto.ts`.
- **Prisma:** models `PascalCase` singular, fields `camelCase`, enum values
  `SCREAMING_SNAKE_CASE`, migration names `snake_case`, tables `@@map`-ped to snake_case.
- **DB (TypeORM):** snake_case columns/tables; entities extend `BaseEntity`.

## Types

- **No `any`.** Use `unknown` + narrowing. `// @ts-ignore`/`@ts-expect-error` only
  with a justification comment.
- Exported functions and public class methods declare explicit return types.
- One class per file.

## Code style

- **No `console.log`/`console.error`** in app code (fine in `*.spec.ts` and the
  two bootstrap `main.ts` FATAL handlers). Use `LoggerService`.
- **No direct `process.env`** outside the sanctioned exceptions
  (`libs/config`, `main.ts`, `app.module.ts`, `data-source.ts`, `prisma/seed.ts`) —
  read config through `ConfigService` / typed namespaces. ESLint enforces this.
- Prefer pure functions and constructor DI. No hidden singletons.
- Prettier owns formatting — don't hand-format; run `npm run format`.
  `format:check` is gated in `npm run verify` and CI; generated files that drift
  (e.g. `next-env.d.ts`, Prisma migrations) are excluded via `.prettierignore` —
  extend that file rather than committing formatter churn on generated output.

## NestJS

- Controllers are thin: validate (DTO) → delegate to a service → return a DTO.
  Business logic and authorization live in **services**, not controllers.
- Controllers never inject a repository / `PrismaService` directly — go through a
  service.
- Every endpoint has Swagger decorators: `@ApiTags` (controller), `@ApiOperation`,
  and `@ApiResponse`/`@ApiOkResponse`. New endpoints live under `/api/v1`.
- Throw NestJS `HttpException` subclasses (`NotFoundException`, `ForbiddenException`,
  …) — never bare `Error` for HTTP paths.
- Pagination uses the shared `PaginationQueryDto` + `paginate()` helper; responses
  are `{ data, meta: { total, page, limit, totalPages } }`.

## Dependencies

- **Exact-pinned** versions everywhere (no `^`/`~`/ranges). Update the lockfile in
  the same change as `package.json`.
- Frontends (`apps/web`, `apps/web-next`) carry their own `package.json` +
  lockfile; keep them pinned too.

## Git & PRs

- **Conventional Commits:** `<type>(<scope>): <description>`
  (`feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`, `ci`).
  commitlint (husky) enforces this — the subject must be lower-case (an acronym
  like "SOC 2" in the subject is rejected; rephrase, e.g. `feat(compliance): …`).
- Keep PRs focused (~≤400 lines diff); split larger work.
- Every behavioural change includes tests (see `testing.md`) and passes all CI gates.
