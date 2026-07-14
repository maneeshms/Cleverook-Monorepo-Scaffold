# Agent guide — compliance (audit, GDPR, retention)

Read this before touching anything under `libs/compliance`, the audit trail, GDPR
export/erasure, consent, or retention. Full context: [`docs/COMPLIANCE.md`](../COMPLIANCE.md).

## The premise

Compliance is organisational; the code's job is to be **audit-ready** — correct
technical controls that generate trustworthy evidence. A subtle bug here doesn't
crash anything, it quietly invalidates an auditor's evidence. Treat this area like
auth: security-critical, changes start from the docs.

## Non-negotiables

1. **The audit trail is append-only.** Never add an update or delete path to
   `AuditLog` except the retention purge. No `save()` over an existing row, no
   `@UpdateDateColumn`, no soft delete. Mutability destroys the whole point.
2. **Never break the hash chain.** `AuditService.record` computes
   `HMAC(secret, prevHash | canonical(payload))` under a Postgres advisory lock so
   appends can't fork. If you add a field to `AuditLog` that should be covered,
   add it to **both** `payload()` and the verification path, or `verifyChain()`
   will report false tampering. Never put `sequence` (DB-generated) in the hash.
3. **No PII or secrets in audit `metadata`.** Store ids, counts, field _names_,
   outcomes — never raw email/name/token values. The audit trail is retained as
   erasure proof, so it must not itself hold the data you erased.
4. **Erasure means erased.** GDPR Art. 17 is not a soft delete. Anonymise
   (crypto-shred / tombstone the PII, keep the skeleton for FK integrity) or hard
   delete. A `deleted_at` that leaves email/name behind is a finding, not a fix.
5. **Keep export & erasure complete.** New personal data → register a
   `PersonalDataContributor` (and a `RetentionTarget` if it ages out). Don't make
   `libs/compliance` import feature modules; use the registries.
6. **Don't weaken retention.** Windows come from config; `0` means keep-forever and
   must be a deliberate, documented choice — never a default to dodge a failing test.

## Patterns

- **Audit a sensitive mutation:** call `auditService.record({ action, actorId,
resourceType, resourceId, outcome, metadata })`. Action codes are
  dotted-lowercase (`user.profile.update`, `data.erase`).
- **New module's personal data:** register a contributor in the module (or in
  `apps/api/src/modules/compliance/compliance-wiring.service.ts`), guarded by the
  right `clevscaffold:<cap>` sentinels if it references an optional capability.
- **Config-injected:** the library reads no env. Add knobs to
  `ComplianceModuleOptions` + `complianceConfig`, wired in the host `forRootAsync`.

## Definition of done (in addition to the global one)

- [ ] No mutation/delete path added to the audit trail (except retention).
- [ ] Hash coverage and `verifyChain()` stay in sync; chain still verifies.
- [ ] No PII/secrets in audit metadata or logs.
- [ ] New personal data is registered for export **and** erasure (and retention if
      it ages).
- [ ] `AUDIT_HMAC_SECRET` handling unchanged (dedicated key in prod, JWT fallback).
- [ ] Control-mapping table in `docs/COMPLIANCE.md` updated if you added a control.
