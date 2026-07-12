# Enterprise Roadmap

Where ClevScaffold is today, the findings from the enterprise security audit, and
the prioritized backlog for high-traffic, critical-system deployments. Tier 1 is
shipped; Tiers 2–3 are planned, sized, and ordered by value-to-risk.

---

## Security audit — findings & disposition

A deep review (code read of auth/token/filter/interceptor + migrations + CI, plus
the 49-check runtime scanner) found **no active/critical vulnerabilities**. The
core is sound: opaque SHA-256-hashed rotating refresh tokens with reuse detection
(family revoke + CRITICAL alert), progressive lockout, constant-work dummy-hash on
unknown users, global validation whitelist, normalized errors with no stack-trace
leakage, all hot columns indexed, tiered rate limits, token-gated metrics.

The audit surfaced hardening/correctness items, all now **addressed**:

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | JWT verify didn't explicitly pin the algorithm | Hardening | ✅ Pinned `algorithms: ['HS256']` on both apps |
| 2 | Refresh-TTL parser treated `12h` as 12 **days** (stripped units) | Correctness | ✅ Shared `parseDurationMs` unit-aware parser + tests |
| 3 | `purgeExpired()` existed but was never scheduled → unbounded `user_sessions` | Ops | ✅ `@nestjs/schedule` hourly `SessionCleanupService` |
| 4 | No `.dockerignore` — `COPY . .` copied `.env`/`.git` into build layers | Supply chain | ✅ Added `.dockerignore` (secrets/VCS excluded) |
| 5 | CI actions had no least-privilege `permissions`; no image scan/SBOM | Supply chain | ✅ `permissions: contents: read`, Trivy scan (fail on CRITICAL), SPDX SBOM, Dependabot |
| 6 | Locked-account login path skips bcrypt → minor timing oracle | Info | Noted; low risk (lockout is the louder signal). Revisit with constant-time login refactor |
| 7 | `/metrics` open when `METRICS_TOKEN` unset | Info | By design (internal-only); set the token in prod (documented) |

Residual low-risk items (6, 7) are documented rather than force-fixed to avoid
over-engineering the reference. Track them here.

---

## Tier 1 — shipped (enterprise baseline)

Auth (rotating hashed refresh + reuse detection + lockout + audit), layered config
with fail-fast validation, Winston audit/alert logging, correlation IDs, Prometheus
metrics, health live/ready + graceful shutdown, Redis-optional distributed
throttling + BullMQ queue, omnichannel messaging, 90%-enforced coverage, full e2e +
OWASP suite + runtime scanner, Docker/Railway, **scheduled session purge**,
**supply-chain scanning (Trivy + SBOM + Dependabot + gitleaks + CodeQL)**,
**pre-commit hooks (husky + lint-staged + commitlint)**.

---

## Tier 2 — next (high value; plan before building)

Ordered by value-to-effort. Each keeps the scaffold's rules: real + configurable,
explicit 503/fallback when unconfigured, DTO-validated, ≥90% covered, no mock data.

1. **Email verification + password reset** *(M)* — complete the auth story
   (currently register/login/refresh only). Signed, single-use, expiring tokens;
   reuse the messaging engine for delivery; enumeration-safe responses. Extends the
   OWASP suite (block F).
2. **Persistent, queryable audit log** *(M)* — today `audit()` streams to
   Winston. Add an `audit_log` table + admin read API (filter by actor/action/time)
   for compliance (SOC2/ISO). Write-through from the existing `audit()` calls.
3. **API keys / service accounts (M2M)** *(M)* — hashed keys, scopes, rotation,
   per-key rate limits. A second auth strategy alongside JWT for machine callers.
4. **Fine-grained authorization (CASL policies)** *(M)* — move beyond coarse
   `@Roles` to attribute/resource policies (`can('update', task)`), still enforced
   in the service layer. Ships a `PolicyGuard` + ability factory.
5. **Idempotency keys for unsafe writes** *(S)* — `Idempotency-Key` header +
   Redis-backed store so retried POSTs don't double-execute. Critical for payments/
   webhooks at scale.
6. **OpenTelemetry tracing** *(M)* — spans across HTTP → service → DB → queue,
   exported OTLP. Correlation IDs already exist; this adds distributed traces.
   Complements the metrics we emit today.
7. **Multi-tenancy (B2B) scaffolding** *(L)* — tenant column + row-level scoping
   guard + tenant-resolution middleware, with a documented isolation model. Wire
   BOLA checks to tenant boundaries.

## Tier 3 — advanced / when the product needs it

- **MFA / TOTP** (RFC 6238) and recovery codes.
- **OAuth / SSO** — Google/GitHub social + enterprise SAML/OIDC for B2B.
- **Secrets-manager integration** — Vault / AWS Secrets Manager / Doppler as a
  config source behind the layered loader (env stays the interface).
- **Feature-flag service** — DB/Redis-backed flags with an admin API + SDK.
- **Webhooks infrastructure** — signed, retried, dead-lettered outbound events.
- **Read-replica routing** — read/write split behind the repository/Prisma layer.
- **Data retention & GDPR jobs** — scheduled anonymization/purge policies.
- **Blue/green + canary deploy recipes** and a DB expand/contract migration guide.

## Cross-cutting hardening backlog

- SHA-pin third-party GitHub Actions (Dependabot now manages the bumps).
- Constant-time login refactor to close the locked-vs-wrong-password timing gap.
- Tighten helmet CSP per app; add HSTS preload guidance.
- Load/soak test harness (k6) + published latency/throughput budgets.
- Chaos checks: Redis-down and DB-failover behavior verified in CI.

---

## How to use this

Pick a Tier-2 item, open a design note, and build it as a self-contained module
following `modules/tasks` (validated DTOs, service-layer authz, ≥90% tests, e2e for
sensitive routes, scanner clean). Keep this file current as items land.
