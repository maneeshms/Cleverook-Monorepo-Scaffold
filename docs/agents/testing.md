# Testing

**Every behavioural change ships with tests, and coverage must stay ≥ 90%.** This
is enforced by the jest preset (`coverageThreshold` on branches/functions/lines/
statements) and by CI — a drop below the floor fails the build. It is not optional.

## Layers

| Layer    | Location                           | Boots what                      | I/O                              |
| -------- | ---------------------------------- | ------------------------------- | -------------------------------- |
| **Unit** | `*.spec.ts` co-located with source | one class, mocked deps          | **none** — no real network or DB |
| **e2e**  | `apps/*/test/**/*.e2e-spec.ts`     | the real Nest app + `supertest` | disposable Postgres DB           |

## Unit tests

- Co-locate `foo.service.spec.ts` next to `foo.service.ts` (never a `__tests__/` dir).
- Mock all I/O: repositories, `PrismaService`, Redis, HTTP, the clock. No real
  network or database in unit tests.
- Descriptive names — `it('locks the account after 5 failed logins')`, never
  `it('works')`.
- Cover branches, not just the happy path: error cases, guards, ownership checks,
  fallbacks. That is how you actually reach 90% and catch real bugs.
- `*.module.ts` files (pure wiring) are excluded from coverage collection — they
  are exercised by e2e. Don't write hollow tests just to cover wiring.

Run: `npm run test` (all) · `npx nx test api` (one project) · add `--coverage`
locally to see the per-file report. `nx test <project> --watch` while iterating.

## e2e tests

1. `npm run db:up` — local Postgres + Redis via docker compose.
2. `npm run e2e:setup` — creates + migrates the disposable DBs
   (`clevscaffold_test` for TypeORM, `clevscaffold_prisma_test` for Prisma).
   Override with `E2E_DATABASE_URL` / `E2E_PRISMA_DATABASE_URL` in CI.
3. `npm run e2e` — runs both apps' e2e suites (`--parallel=1`).

- e2e helpers truncate tables between suites (`apps/api/test/helpers`). Keep tests
  independent — no ordering assumptions.
- **Throttling** is toggled per-request via `THROTTLE_DISABLED` (read through the
  ThrottlerModule `skipIf`). Functional suites disable it; the rate-limit suite
  turns it on to assert `429`.
- **Migration gotcha:** Postgres has no `CREATE TYPE IF NOT EXISTS`; enum creation
  uses the `DO $$ BEGIN … EXCEPTION WHEN duplicate_object THEN null; END $$;` guard.

## Security tests

- `apps/api/test/security-owasp.e2e-spec.ts` — OWASP A01/A02/A03/A05/A07 + BOLA +
  mass assignment + token rotation/reuse. Extend it when you add sensitive routes.
- `npm run scan:security` — black-box runtime scanner against a **live** api
  (`npx nx serve api` first). 49-check baseline, all passing; exits non-zero on any
  HIGH/MEDIUM failure. Point it elsewhere with `CLEVSCAFFOLD_BASE`.

## Definition of done (backend change)

```
npm run verify   # format:check + lint + typecheck + build + unit (coverage ≥90%)
npm run e2e      # when logic/endpoints changed
```

New endpoint touching auth/data? Also extend the OWASP e2e suite and run
`npm run scan:security` against a local serve. Then walk the AGENTS.md self-audit
checklist — and remember: **when a gate fails, fix the code, never the gate** (no
threshold edits, no `.skip`, no assertion-free coverage farming).
