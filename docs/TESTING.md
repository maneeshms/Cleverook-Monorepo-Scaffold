# Testing

Two layers, one hard rule: **every behavioural change ships with tests and
coverage stays ≥ 90%** (branches, functions, lines, statements). The jest preset
enforces the floor; CI fails below it.

## Unit tests

- Co-located `*.spec.ts`, mocked dependencies, **no real network or DB**.
- Cover error/branch paths, not just the happy path.
- `*.module.ts` wiring files are excluded from coverage (exercised by e2e).

```bash
npm run test                 # all projects, coverage enforced
npx nx test api              # one project
npx nx test api --watch      # iterate
npx nx test api --coverage   # per-file report
```

## e2e tests

Boot the real Nest app against a disposable Postgres DB via `supertest`.

```bash
npm run db:up          # Postgres + Redis
npm run e2e:setup      # create + migrate clevscaffold_test
npm run e2e            # run all e2e suites (--parallel=1)
```

- Suites: `apps/api/test` (health, auth incl. lockout + refresh reuse, tasks incl.
  pagination/ownership, OWASP).
- Tables are truncated between suites; keep tests order-independent.
- Throttling toggles via `THROTTLE_DISABLED` (per-request `skipIf`) — functional
  suites disable it, the rate-limit suite enables it.
- In CI, e2e runs against a Postgres **service container** (see `ci.yml`) with
  `E2E_*` connection overrides.

## Security tests

- **OWASP e2e:** `apps/api/test/security-owasp.e2e-spec.ts` — A01/A02/A03/A05/A07 +
  BOLA + mass assignment + token rotation/reuse.
- **Runtime scanner:** `npm run scan:security` against a live api
  (`npx nx serve api` first). 49 black-box checks, all passing at baseline; exits
  non-zero on any HIGH/MEDIUM failure. Retarget with `CLEVSCAFFOLD_BASE`
  (default `http://localhost:3000/api/v1`). See [SECURITY.md](SECURITY.md).

## Definition of done

```bash
npm run lint && npm run typecheck && npm run build && npm run test
npm run e2e     # when logic or endpoints changed
```
