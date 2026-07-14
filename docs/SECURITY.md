# Security

Security is the top priority of this scaffold. This page maps threats to the
controls that address them and records the scanner baseline. The rules agents (and
humans) must follow when writing code are in
[`docs/agents/security.md`](agents/security.md).

## Threat → control traceability

| Threat (OWASP)                        | Control in this repo                                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 Broken Access Control / API1 BOLA | Global `JwtAuthGuard` + `@Roles`; identity from JWT only; ownership checked in services (404 for missing _and_ not-yours)                               |
| A02 Cryptographic / Data Failures     | bcrypt ≥12; opaque SHA-256-hashed refresh tokens; DB-stored provider creds encrypted (`secret-cipher`); DTOs never expose entities                      |
| A03 Injection                         | Global `ValidationPipe` (whitelist + forbidNonWhitelisted); parameterized queries; `ParseUUIDPipe`; migrations-only schema                              |
| A05 Security Misconfiguration         | helmet; `X-Powered-By` off; strict CORS (wildcard ⇒ credentials off); Swagger prod-gated; fail-fast config validation                                   |
| A07 Auth Failures                     | 15-min access JWT; rotating refresh + reuse detection → family revoke + CRITICAL alert; progressive lockout; constant-time compare; no user enumeration |
| API4 Resource Exhaustion              | Throttler (Redis-backed, global across instances); 1 MB body cap; bounded pagination                                                                    |
| API5 BFLA                             | Role guards; admin routes reject normal users                                                                                                           |
| API6 Mass Assignment                  | DTO whitelisting rejects privileged fields (role, ownerId)                                                                                              |
| API7 Improper Inventory               | Versioned `/api/v1`; normalized error shape without internals                                                                                           |
| API9 Business Logic                   | Ownership + tier checks in services; huge/negative pagination bounded                                                                                   |
| Secrets exposure                      | No secrets in code/JSON/logs; loader rejects secret keys in JSON; gitleaks in CI                                                                        |
| Supply chain                          | Exact-pinned deps; `npm audit` gate (Docker + CI); CodeQL; dependency-review                                                                            |

## Layered defenses

- **Transport:** helmet, HSTS-ready, strict CORS, trust proxy, correlation IDs.
- **Auth:** short-lived access + rotating hashed refresh with reuse detection; lockout.
- **Input:** validated DTOs everywhere, whitelist, size caps, UUID parsing.
- **Data:** entities never returned raw; sensitive fields stripped; audit trail via
  `logger.audit()`; GDPR export + soft-delete.
- **Ops:** metrics endpoint token-gated; logs redact secrets; graceful shutdown.

## Runtime scanner baseline

`scripts/security_scan.py` (run via `npm run scan:security`) probes a live API with
49 black-box checks across the OWASP blocks above. **Baseline: 49/49 passing**
(34 HIGH, 8 MEDIUM, 6 LOW, 1 INFO), zero failures. It self-provisions test users,
cleans them up, and exits non-zero on any HIGH/MEDIUM failure — wire it into
release verification. Re-run after any auth/validation/endpoint change:

```bash
npx nx serve api                 # http://localhost:3000/api/v1
npm run scan:security
```

## CI security jobs

- `security.yml` — npm audit (root + each frontend, block on CRITICAL), gitleaks
  (license-free binary), dependency-review (PRs, opt-in).
- `codeql.yml` — CodeQL `security-and-quality` on push/PR + weekly (opt-in).
- `ci.yml` — the OWASP e2e suite runs as part of the e2e job; Trivy CRITICAL gate +
  SBOM per image.

**Code scanning is opt-in.** CodeQL, PR dependency-review, and Trivy SARIF upload
require GitHub Advanced Security (free on public repos, paid on private). They run
only when the repo variable **`ENABLE_CODE_SCANNING`** is `true`, so CI is green
out of the box and these light up once you enable code scanning. gitleaks, npm
audit, the Trivy CRITICAL gate, and SBOM generation run everywhere unconditionally.

## Audit findings & backlog

The enterprise security audit (code review + runtime scanner) found no
active/critical vulnerabilities; the hardening items it surfaced (algorithm
pinning, refresh-TTL parsing, scheduled session purge, `.dockerignore`, CI
least-privilege + Trivy/SBOM/Dependabot) are addressed. Full findings table and
the residual low-risk items are tracked in [ROADMAP.md](ROADMAP.md).

## Supply chain

- **Image scanning:** Trivy scans every built image in CI and fails on CRITICAL.
- **SBOM:** an SPDX SBOM is generated per image for provenance.
- **Dependabot:** weekly npm (root + both frontends), GitHub Actions, and Docker
  base-image updates, grouped to limit PR noise.
- **Pre-commit:** husky runs lint-staged (eslint + prettier) and commitlint
  (Conventional Commits) before every commit.

## Compliance (SOC 2 · GDPR · ISO 27001)

The technical controls that back a SOC 2 / GDPR / ISO 27001 program — the tamper-
evident audit trail, GDPR export/erasure, consent ledger, and retention enforcement —
ship as the opt-in `compliance` capability (`@clevrook/compliance`, `--with-compliance`).
See **[COMPLIANCE.md](COMPLIANCE.md)** for the control-to-framework mapping and the
explicit technical-vs-organisational split (what the scaffold does vs. what your org
must own).

## Reporting

Never commit a real secret. If one is exposed, rotate it immediately and purge it
from history. Configure branch protection to require the CI + Security workflows.
