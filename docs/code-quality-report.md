# Code Quality & Production Readiness Report

## Addendum (Jun 23, 2026) — security hardening round

This round addressed the highest-severity findings from an external review and
corrects some claims in the earlier report that were overstated or stale.

**Fixed / shipped:**
- **KDF is now memory-hard.** New envelopes use scrypt (AES-256-GCM) instead of
  PBKDF2; old PBKDF2/legacy envelopes are still read for migration. The sole
  secret guarding local data is no longer protected by a GPU-friendly KDF.
- **The audit log is now genuinely keyed, not just checksummed.** The previous
  "hash-chained" log used an *unkeyed* SHA-256 that anyone could recompute, and
  accepted a bare plaintext array (a no-passphrase injection vector). It now uses
  an HMAC keyed by a passphrase-derived key, refuses plaintext injection, and is
  verified automatically on unlock. (Residual, documented honestly: a holder of
  the passphrase can still forge it; wholesale deletion of the encrypted audit
  blob is not yet anchored in the vault.)
- **Backup import is non-destructive.** It validates every blob as a real
  encrypted envelope before touching storage, rolls back on write failure, and
  can verify the backup unlocks with the current passphrase first. A
  malformed/hostile file can no longer wipe the only copy of irrecoverable data.
- **Connector feed fails closed.** No configured public key → refuse the feed
  (was fail-open); older-than-cached feeds are rejected (rollback protection);
  the signature-failure path now has unit tests.
- **CI audit claim corrected.** The prior "`npm audit` … passing" was stale (it
  exited non-zero on a transitive dev advisory). CI now gates on the
  production-dependency audit (what actually ships) and runs the full audit as
  informational.

**Corrections to earlier framing in this document:** the phrases
"tamper-evident" and "integrity-protected" used below for the audit trail
overstated the *original* unkeyed design and should be read in light of the
keyed-HMAC change above. The scorecard's **7.8/10 / "pilot-ready"** was already
disowned in the Jun 8 addendum yet still printed below — treat the prose, not
the number, as current: this is a solid local-first MVP, not a production
service.

## Addendum (Jun 8, 2026)

This addendum corrects some over-optimistic framing in the original report and
records a round of feature work that closed real gaps.

**Fixed / shipped in this round:**
- **HIBP was dead code; now wired.** Breach lookup, the free k-anonymity
  password check, and manual suggestions were implemented but never reachable
  from the UI. They are now surfaced in a **Settings** tab and the API key is
  stored encrypted in the vault and passed into local scans.
- **Real bug fixed:** the password breach check hashed with SHA-256 while the
  Pwned Passwords range API is defined over **SHA-1**, so it would always have
  returned 0 matches. Now uses SHA-1 (security-irrelevant; correctness only).
- **Findings are now actionable** (open → in progress → mitigated), persisted
  and audited; the dashboard reflects open counts. Previously the status field
  existed in the model but could never change.
- **Passphrase data-loss trap fixed:** vault creation now distinguishes
  "no vault" from "wrong passphrase", requires confirm + a strength check, and
  exposes an explicit "no recovery / wipe" path.
- **`App.tsx` decomposed:** all state and handlers moved into a
  `useUnlinkdApp` hook; the component is now a thin view. Integration tests
  added for create/unlock, scan→mitigate, and settings.
- **Connector content governance:** every connector now carries a
  `lastReviewed` date enforced by a freshness test + `connectors:check` script,
  documented in `docs/connector-governance.md`.

**Honest reframing of the original scores:** the prior "7.8/10, pilot-ready"
was generous. Connector *automation* remains minimal (a handful of agent steps
vs. ~150 manual ones), there is no cross-device sync by design, and large parts
of the PRD (MFA posture, recovery enforcement, compliance profiles, infra
stack) are unbuilt. Treat this as a solid local-first MVP, not a production
service.

## Scope
Assessment of the current TypeScript/React MVP codebase for maintainability, reliability, security posture, testing, and delivery readiness.

## Executive summary
- **Overall readiness (Feb 15, 2026):** **Pilot-ready local-first app** (still not “enterprise production”).
- **Strengths:** strict `lint`/`test`/`build` gates, consent-safe graphing, runtime validation/normalization, encrypted vault + encrypted evidence store, encrypted backup/export, and an encrypted + integrity-checked local audit trail.
- **Top blockers before broader production:** limited connector coverage/content governance, e2e coverage needs expansion (initial smoke exists), and no cross-device sync strategy (by design today).

## Recent hardening (Feb 14, 2026)
- **Encrypted “vault” state added (localStorage)**
  - A normalized, versioned vault envelope (`unlinkd.vault.v1`) stores personas, identifiers, accounts, connector instances, and findings encrypted at rest.
- **Encrypted evidence vault added (IndexedDB)**
  - Evidence payloads are encrypted and stored in IndexedDB; metadata lives in the encrypted vault.
  - Evidence hashing now correctly uses SHA-256 on raw bytes (no lossy string conversion).
- **Backup/export and restore added**
  - Backup contains ciphertext-only vault + ciphertext-only audit log + all encrypted evidence payloads.
- **Audit trail expanded**
  - Audit action support now includes persona/account/connectors/evidence/scan/backup events (still hashed/redacted for sensitive identifier additions).

## Recent additions (Feb 15, 2026)
- **Signed connector catalog feed + in-app updates**
  - Versioned feed artifacts in `public/connectors/` (`catalog.v1.json` + `catalog.v1.sig`) with Ed25519 signature verification in-app.
  - Cached feed stored locally and merged with a small builtin fallback catalog.
- **Account discovery imports**
  - Autodetected password-manager CSV imports (Bitwarden / 1Password / LastPass / Chrome + generic).
  - Mailbox `.mbox` discovery import in-app for smaller files, plus a streaming local-agent option for larger archives.
- **Local Playwright agent (optional)**
  - Export agent jobs from the app, run Playwright locally, import encrypted evidence results back into the vault.

## What is working well
1. **Quality gates are present and passing**
   - Linting, tests, production build, and `npm audit` checks are available and passing locally.
2. **CI enforcement exists**
   - GitHub Actions executes lint/test/build/audit for push and pull requests.
3. **Consent boundary is enforced in graph modeling**
   - Exposure edges are inferred only from consented identifiers.
4. **Runtime input hardening and policy checks**
   - Validation/normalization gates input; duplicate and max-limit checks are enforced before persistence.
5. **Encrypted local data lifecycle controls**
   - Vault + audit + evidence are encrypted at rest with passphrase-based unlock flow.
6. **Auditability improved**
   - Identifier decisions are recorded in a hash-chained audit log with verification support.
   - Audit records are encrypted at rest (stored as encrypted envelopes).

## Remaining key risks and gaps

### 1) Connector coverage + content governance (High)
- Catalog breadth is still small relative to user expectations (brokers, account deletion/hardening, and regional variance).
- **Impact:** market-fit risk (users expect broad “supported providers” coverage).
- **Recommendation:** treat connectors like content: review/QA, provenance, versioning, and a publishing cadence. Expand the catalog to cover top brokers and the most-used account providers first.

### 2) Limited integration/e2e coverage (Medium)
- Playwright e2e smoke tests exist, but coverage is still light relative to end-to-end risk.
- **Impact:** cross-module workflow regressions may slip through (unlock → import → evidence → report).
- **Recommendation:** expand browser-level e2e tests for key journeys (unlock, connectors, evidence upload/import, report export, backup/restore).

### 3) Local-agent hardening + UX (Medium)
- Agent is intentionally local-only but still needs hardening and UX polish (packaging, versioning, clearer error reporting, and a minimal “trust boundary” story for users).
- **Impact:** support burden and reliability issues on real-world sites.
- **Recommendation:** add an agent “doctor” command, improve job schema validation errors, and define a compatibility policy for Playwright/browser versions.

### 4) Dependency lifecycle management still manual (Medium)
- Major upgrades remain pending and require planned compatibility testing.
- **Impact:** drift can accumulate and increase upgrade risk.
- **Recommendation:** add scheduled dependency update PRs and compatibility matrix checks.

## Production readiness scorecard

> Superseded — see the Jun 23 and Jun 8 addenda. These numbers were disowned as
> "generous" but left here for history. Read the prose, not the score: a solid
> local-first MVP, not a production service.

- **Code correctness:** 8.4/10
- **Test depth:** 7.2/10
- **Security posture:** 7.8/10
- **Privacy posture:** 8.2/10
- **Operational readiness:** 6.7/10
- **Overall:** **7.8/10**

## 30-day remediation plan
1. **Week 1 (must-do):**
   - Expand browser-level e2e test coverage for unlock + connectors + evidence + report + backup flows.
   - Add scheduled dependency update checks in CI.
2. **Week 2:**
   - Expand connector catalog coverage and establish publishing/review workflow for feed updates.
3. **Week 3:**
   - Harden local agent UX (doctor, better errors) and add job templates for the most common flows.
4. **Week 4:**
   - Improve recheck scheduling UX and add browser-level smoke tests for rechecks + evidence.

## Recommended acceptance bar for first production pilot
- 0 high-severity audit findings.
- CI required status checks for lint/test/build/audit.
- Encrypted-at-rest storage enabled for sensitive local artifacts.
- Audit records are integrity-protected and export-verifiable.
- Backup export/import verified with routine restore drills.
