# Security — the ruleset agents must enforce

Security is the top priority of this scaffold. These rules are non-negotiable.
When a change touches auth, validation, crypto, data exposure, file handling, or
any endpoint, this file governs. If a requirement here conflicts with
convenience, security wins — or you stop and flag it.

The auth engine lives in `libs/auth` (`@clevrook/auth` — extended, never forked;
see `docs/AUTH.md`); the reference app wiring is `apps/api` (users, tasks).
Mirror these patterns; don't invent new ones.

---

## 1. Secrets & credentials

- **Never** hardcode a secret, token, password, API key, connection string, or
  private key — not in source, tests, comments, JSON config, or YAML.
- Secrets come from the environment only. `.env` locally (git-ignored), host vars
  (Railway) in prod. The layered-config loader **rejects secret-looking keys**
  (`SECRET`, `PASSWORD`, `API_KEY`, `TOKEN`, `PRIVATE`, `CREDENTIAL`, …) found in
  `config/*.json` — keep it that way.
- Never log sensitive values at any level (JWT, password/hash, refresh token, API
  key, DB URL). The logger redacts known fields; don't defeat it by string-building.
- Credentials stored in the DB (e.g. messaging provider keys) are encrypted at
  rest via `libs/common` `secret-cipher` (`MESSAGING_SECRET`/derived key). Never
  store them plaintext.
- GitHub Actions use `${{ secrets.* }}`. CI-only test secrets may be inline in the
  workflow (clearly non-production), never real ones.

## 2. Authentication & sessions (the JWT design — don't weaken it)

- **Access token:** JWT, ~15 min TTL, `HS256` with `JWT_ACCESS_SECRET` (≥32 chars,
  validated at boot). Carries `{ sub, email, role, sessionId }` — nothing sensitive.
- **Refresh token:** **opaque random string, never a JWT.** Only its SHA-256 hash
  is stored (`user_sessions`). Rotating: each refresh issues a new token and
  invalidates the old one.
- **Reuse detection:** presenting an already-rotated refresh token means theft →
  revoke the entire session family and emit a **CRITICAL security alert**
  (`logger.alert`). This is implemented in `libs/auth` `TokenService`; preserve it.
- **Lockout:** progressive delay/lock after repeated failed logins (counter +
  `locked_until` on the user). Login uses a constant-time compare and a dummy
  bcrypt hash on unknown users to avoid timing/enumeration leaks.
- **bcrypt** cost ≥ 12 (`BCRYPT_ROUNDS`). Never compare passwords with `==`.
- Auth events (`register`, `login`, `logout`, lockout, refresh-reuse) go through
  `logger.audit()` / `auditAuth()`.

## 3. Authorization (access control)

- **Guards by default:** the global `JwtAuthGuard` protects everything; opt out
  only with `@Public()` and only when genuinely public.
- Roles via `@Roles(Role.ADMIN)` + `RolesGuard`. Guard chain: Throttle → JwtAuth
  → Roles.
- **BOLA/IDOR:** never trust `userId`/`ownerId`/`companyId` from the request body
  for privilege-sensitive ops — derive identity from the verified JWT
  (`@CurrentUser()`). Every resource read/write checks ownership in the **service
  layer** (see `TasksService.findOneForUser`: returns 404 for both "missing" and
  "not yours" so it doesn't leak which ids exist).
- Don't implement role/permission checks inline in controllers — delegate to services.

## 4. Input validation & injection

- Global `ValidationPipe` with **`whitelist: true` + `forbidNonWhitelisted: true`**
  - `transform: true`. Unknown properties are rejected (mass-assignment defense).
- Every request body/query is a **DTO with `class-validator` decorators**. No manual
  validation in controllers. DTOs bound sizes (`@MaxLength`, `@Max`) — pagination
  `limit` is capped (≤100).
- **Mass assignment:** never bind entities directly; whitelist writable fields via
  DTOs. Fields like `role`, `ownerId` must be rejected on register/update.
- **SQL injection:** parameterized queries only — TypeORM query builder /
  repository APIs. **Never** concatenate user input into SQL. Schema changes are
  **migrations only** (no `synchronize`).
- Path params that are ids use `ParseUUIDPipe` (rejects traversal/garbage → 400).
- No SSTI: user text is stored/returned literally, never evaluated.

## 5. Transport & HTTP hardening (see `apps/api/src/main.ts`)

- `helmet()` on. `X-Powered-By` off. `X-Content-Type-Options: nosniff`,
  `X-Frame-Options` present.
- **CORS:** never reflect an arbitrary Origin with credentials. Wildcard
  `CORS_ORIGINS=*` emits literal `*` with credentials **disabled**; set an explicit
  allowlist in prod to enable credentialed requests.
- Body size capped (1 MB) — DoS guard. `trust proxy` set for correct client IPs
  behind Railway/Cloudflare.
- **Rate limiting** via `ThrottlerModule` (Redis-backed when `REDIS_URL` set, so
  limits are global across instances). Auth endpoints are throttled.
- Correlation ID middleware on every request (`x-request-id`), threaded into logs
  and the response.

## 6. Error handling & data exposure

- Global exception filter returns a **normalized shape**
  (`{ statusCode, error, message, path, timestamp, requestId }`) with **no stack
  traces or internals** in production responses.
- **DTOs never expose entities.** Response shapes omit `passwordHash`,
  `refreshTokenHash`, internal flags. Use explicit response DTOs / serialization.
- GDPR is handled by `@clevrook/compliance` (`/privacy/export`, `/privacy/erase`,
  consent, retention). New personal data must be registered with the
  `PersonalDataRegistry` or export/erasure silently go incomplete — recipe in
  `recipes.md`, non-negotiables in `compliance.md`. The audit trail is
  **append-only and hash-chained**: never add an update/delete path to it, and
  never put PII in audit metadata.

## 7. File uploads (when added)

- Validate the **actual bytes** (magic-byte sniff via `libs/common` image-signature
  helper), not the client-supplied content-type or filename. SVG excluded
  (script-capable). Cap size → `413`. Storage keys are **server-generated**, never
  derived from the client filename (path-traversal defense).

## 8. Dependencies & supply chain

- Exact-pinned deps; lockfiles committed. Docker build runs `npm audit
--audit-level=critical` and fails on criticals. `security.yml` audits weekly +
  runs gitleaks + dependency-review.
- CodeQL (`security-and-quality`) runs on push/PR/weekly.

## 9. Verify before you claim done

- `apps/api/test/security-owasp.e2e-spec.ts` covers A01/A02/A03/A05/A07 + BOLA +
  mass-assignment + token rotation/reuse. Keep it green.
- `npm run scan:security` (needs a live api) runs the black-box scanner — **49-check
  baseline, all passing**. A HIGH/MEDIUM failure exits non-zero and must block merge.

## Quick reject-list (flag these in review)

`any` · direct `process.env` · missing DTO validation · missing `@Public()`/guard ·
identity from request body · raw SQL concatenation · `synchronize: true` · secret in
code/JSON/log · CORS `*` with credentials · entity returned to client · stack trace
in response · endpoint without a test · `console.log` in app code · update/delete
path on `audit_log` · PII in audit metadata · personal data stored without a
`PersonalDataContributor`.
