# Compliance — SOC 2, GDPR, ISO 27001

**Read this first.** Compliance is **not** something code alone can deliver:

- **SOC 2** is an _audit_ of your controls over a period, performed by a licensed
  CPA firm. It needs policies, access reviews, vendor management, an incident-
  response process, and evidence collected over 3–12 months.
- **GDPR** is a _legal_ obligation: lawful basis, a privacy notice, Data Processing
  Agreements with sub-processors, a Record of Processing Activities (RoPA), and — for
  some orgs — a DPO and DPIAs.
- **ISO 27001** certifies an _Information Security Management System_ (ISMS): risk
  assessment, a Statement of Applicability over Annex A, management review, and an
  external certification audit.

What this scaffold gives you is the **technical substrate** — the controls and the
_evidence they generate_ — so a project built from it starts **audit-ready** instead
of accruing compliance debt. The rest (the organisational program) is on you; the
[checklist below](#technical-vs-organisational-split) is explicit about which is which.

---

## The `compliance` capability

Everything technical here ships in **`@clevrook/compliance`** (`libs/compliance`) and
is wired into `apps/api`. It is an **opt-in capability** in the generator:

```bash
# Full reference app (default) — compliance included.
node scripts/init.mjs --yes

# Minimal app that opts compliance in (implies auth — personal data is per-user):
node scripts/init.mjs --yes --minimal --with-compliance
```

The library is config-injected (`ComplianceModule.forRootAsync`) and reads no env
itself, so it is portable across projects. It provides four pillars:

| Pillar                  | Service              | What it does                                               |
| ----------------------- | -------------------- | ---------------------------------------------------------- |
| **Audit trail**         | `AuditService`       | Append-only, HMAC hash-chained, tamper-evident event log   |
| **Data-subject rights** | `DataSubjectService` | GDPR export (Art. 15/20) + erasure/anonymisation (Art. 17) |
| **Consent**             | `ConsentService`     | Append-only consent ledger (Art. 6/7)                      |
| **Retention**           | `RetentionService`   | Scheduled storage-limitation enforcement (Art. 5(1)(e))    |

### HTTP surface (auto-registered; opt out with `controller: false`)

| Route                            | Purpose                                       |
| -------------------------------- | --------------------------------------------- |
| `GET /api/v1/privacy/export`     | Export all my personal data (Art. 15/20)      |
| `POST /api/v1/privacy/erase`     | Erase/anonymise my data (Art. 17)             |
| `GET /api/v1/privacy/consent`    | My current consent state per purpose          |
| `POST /api/v1/privacy/consent`   | Grant/withdraw consent for a purpose (Art. 7) |
| `GET /api/v1/admin/audit/verify` | **ADMIN** — verify audit-chain integrity      |

---

## How the technical controls map to the frameworks

The same controls satisfy multiple frameworks — this is the table an auditor wants.

| Control in this repo                                                   | SOC 2 (TSC)      | GDPR                              | ISO 27001:2022 (Annex A)            |
| ---------------------------------------------------------------------- | ---------------- | --------------------------------- | ----------------------------------- |
| Append-only, HMAC-chained audit trail (`AuditService`)                 | CC7.2, CC7.3     | Art. 5(2) accountability, Art. 30 | A.8.15 Logging, A.8.16 Monitoring   |
| Audit-chain integrity verification (`verifyChain`)                     | CC7.3            | Art. 32(1)(b)                     | A.8.15, A.5.28 evidence             |
| RBAC + JWT + BOLA-safe ownership (guards, services)                    | CC6.1, CC6.3     | Art. 32                           | A.5.15, A.5.18, A.8.2, A.8.3        |
| Rotating hashed refresh tokens + reuse detection                       | CC6.1            | Art. 32                           | A.8.5 authentication                |
| Encryption in transit (helmet/HSTS) + secrets at rest (`SecretCipher`) | CC6.7            | Art. 32(1)(a)                     | A.8.24 Cryptography                 |
| GDPR data export (`DataSubjectService.exportData`)                     | (Privacy) P6     | Art. 15, Art. 20                  | A.5.34 PII                          |
| Erasure / anonymisation (`erase`)                                      | (Privacy) P4     | Art. 17                           | A.8.10 Information deletion, A.5.34 |
| Consent ledger (`ConsentService`)                                      | (Privacy) P2, P3 | Art. 6, Art. 7                    | A.5.34                              |
| Retention / storage-limitation cron (`RetentionService`)               | CC6.5 disposal   | Art. 5(1)(e)                      | A.8.10, A.5.33                      |
| Input validation / mass-assignment defence (ValidationPipe, DTOs)      | CC6.8, PI1       | Art. 32                           | A.8.26, A.8.28                      |
| Secrets hygiene — env-only, gitleaks, no secrets in logs               | CC6.1            | Art. 32                           | A.8.24, A.5.14                      |
| Supply chain — pinned deps, `npm audit` gate, CodeQL, SBOM             | CC7.1, CC8.1     | —                                 | A.8.8, A.8.28, A.5.23               |
| Change management — PRs, CI gates, CODEOWNERS                          | CC8.1            | —                                 | A.8.25, A.8.32                      |
| Availability — health/readiness, graceful shutdown                     | A1.1, A1.2       | —                                 | A.8.14, A.5.30                      |
| Correlation IDs + structured logs                                      | CC7.2            | Art. 33 (breach forensics)        | A.8.15, A.8.16                      |

> The audit trail is the linchpin: most SOC 2 CC7 and ISO A.8.15 evidence is "show me
> who did what, when, and prove it wasn't altered." The hash chain answers the last part.

---

## Using it

### Audit an action

```ts
await this.audit.record({
  action: 'user.profile.update',
  actorId: user.sub,
  resourceType: 'user',
  resourceId: user.sub,
  ipAddress,
  metadata: { fields: ['displayName'] }, // never raw PII values or secrets
});
```

Every consent change, data export, erasure, and retention run is audited
automatically. Add `record(...)` calls at your own sensitive mutations.

### Make a new module export/erasure-complete

Register a `PersonalDataContributor` (see `apps/api/src/modules/compliance/`):

```ts
this.personalData.register({
  key: 'invoices',
  collect: (userId) => this.invoices.find({ where: { userId } }),
  erase: async (userId) => (await this.invoices.delete({ userId })).affected ?? 0,
});
```

Export and erasure then include it automatically — the library never imports your
module. Register a `RetentionTarget` the same way for time-based purging.

### Verify the trail hasn't been tampered with

`GET /api/v1/admin/audit/verify` → `{ ok: true, checked: N }`, or the first
`brokenAtSequence` if a row was inserted, edited, deleted, or reordered. Wire it
into a scheduled integrity check and alert on `ok: false`.

### Configuration

Set a **dedicated** `AUDIT_HMAC_SECRET` in production (it falls back to
`JWT_ACCESS_SECRET` so dev boots, but the chain's tamper-evidence is only as strong
as this key staying secret). Tune retention via `RETENTION_*` env vars (`.env.example`).

---

## Technical vs organisational split

The scaffold does the left column. **You** must do the right column — no repo can.

| ✅ Provided by the scaffold (technical)              | ⛔ Your responsibility (organisational / legal)                       |
| ---------------------------------------------------- | --------------------------------------------------------------------- |
| Tamper-evident audit trail + integrity check         | Log review cadence, retention policy sign-off, SIEM shipping          |
| GDPR export / erasure / consent endpoints            | Privacy notice, lawful-basis decisions, DSAR SLA & process            |
| Retention windows + enforcement                      | Deciding the windows with legal; documenting the basis                |
| RBAC, encryption, secrets hygiene, input validation  | Access reviews, key management/rotation policy, risk assessment       |
| Change-management evidence (PRs/CI/CODEOWNERS)       | Approvals policy, segregation of duties, ticketing linkage            |
| Supply-chain scanning + SBOM                         | Vendor/sub-processor management, DPAs                                 |
| Health/readiness, graceful shutdown, backups-ready   | Backup **execution** + restore tests, BCP/DR plan, on-call/IR runbook |
| Breach-forensics substrate (audit + correlation IDs) | Breach detection triage + 72h notification process (Art. 33)          |
| —                                                    | Policies (InfoSec, access, incident, retention), staff training       |
| —                                                    | The **audit/certification** itself (SOC 2 CPA firm; ISO 27001 body)   |

## Keeping future projects compliant

1. **Enable the capability** — default (`init.mjs`) includes it; for a minimal app use
   `--with-compliance`.
2. **Register each module's personal data** (contributor + retention target) as you
   add features, so export/erasure/retention stay complete.
3. **Set a dedicated `AUDIT_HMAC_SECRET`** and review the retention windows with legal.
4. **Schedule `verifyChain()`** and alert on failure.
5. **Own the organisational column** above — that is what turns audit-ready code into
   an actual certification.

See also: [`SECURITY.md`](SECURITY.md) (threat→control map + OWASP scanner) and
[`docs/agents/compliance.md`](agents/compliance.md) (rules for agents touching this area).
