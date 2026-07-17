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
- `image-scan.yml` — **daily** Trivy scan of every deployable image rebuilt fresh
  from `main` (see below).

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

- **Image scanning:** Trivy scans every built image in CI and fails on CRITICAL,
  plus the daily `image-scan.yml` sweep below.
- **SBOM:** an SPDX SBOM is generated per image for provenance.
- **Dependabot:** weekly npm (root + both frontends), GitHub Actions, and Docker
  base-image updates, grouped to limit PR noise.
- **Pre-commit:** husky runs lint-staged (eslint + prettier) and commitlint
  (Conventional Commits) before every commit.

## Continuous vulnerability management (daily image scan)

CI only scans when code changes; images age faster than code. `image-scan.yml`
therefore **rebuilds every deployable image from `main` daily** (04:30 UTC,
`pull: true` so today's base layers are scanned, not a stale cache) and runs Trivy
over OS packages + bundled npm deps.

**The loop is designed so findings cannot be ignored silently:**

1. **Detect** — the gate is _fixable_ CRITICAL/HIGH (minus `.trivyignore` accepted
   risks). Unfixable CVEs are reported (full-report artifact + optional SARIF) but
   don't page — there is no action to take until upstream releases a fix.
2. **Track** — a finding opens **one GitHub issue per app** (label
   `vulnerability`), refreshed with the current report on every scan while it
   persists — never duplicated. The workflow run also stays **red** until fixed.
3. **Fix** (within SLA):
   | Severity (fixable) | SLA                                       |
   | ------------------ | ----------------------------------------- |
   | CRITICAL           | 48 hours                                  |
   | HIGH               | 7 days                                    |
   | MEDIUM             | 30 days (batch with routine updates)      |
   | LOW / unfixable    | best effort; revisit via the daily report |
4. **Verify** — the next clean scan **auto-closes the issue** with a comment; the
   workflow goes green. No manual bookkeeping.

**Remediation playbook** (in order of likelihood):

- **npm dependency CVE** → usually already waiting as a Dependabot PR; merge it
  (minor/patch auto-merge on green). Otherwise bump the exact pin in the owning
  `package.json` + lockfile.
- **Base-image / OS package CVE** → bump the `FROM node:22-alpine` / `nginx:alpine`
  tag if a newer tag carries the fix, or simply **rebuild + redeploy**: `alpine`
  tags are re-published with patched packages, and `pull: true`/Railway rebuilds
  pick them up. If the daily scan is clean but production is old, redeploying IS
  the fix.
- **No fix released** → if the gate still fails (rare, since it's fixable-only),
  add a `.trivyignore` entry **with owner, reason, and expiry date** — accepted
  risks are code-reviewed and time-boxed, never permanent.

Manual run any time: `gh workflow run image-scan.yml`.

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
