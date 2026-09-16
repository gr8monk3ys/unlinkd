# unlinkd

**Get yourself removed from the internet — and keep the proof.**

Removal is not the hard part; *proving* it is. Requests get ignored, brokers
re-list you months later, and by the time you need to escalate you no longer
remember what you sent, to whom, or when. unlinkd is a local-first workspace
that keeps that record: work through data-broker and account-removal
checklists, capture encrypted evidence of each request, and keep a
tamper-evident log of what you asked and when — the paper trail a GDPR or CCPA
escalation actually needs.

It runs entirely in the browser: all data (personas, identifiers, accounts,
connectors, findings, evidence, audit log) is encrypted with your passphrase and
stored locally. There is no backend, no account, and no tracking.

> **Scope, plainly:** the connector catalog is *guided manual checklists*. A
> small number of connectors carry agent steps that navigate to a URL and take a
> screenshot. unlinkd captures and organizes evidence; it does not submit
> opt-outs for you. See *Honest scope* below.

> **California residents: start with DROP.** Since 1 August 2026 a single
> verified request through California's [Delete Request and Opt-out
> Platform](https://cppa.ca.gov/data_brokers/) obliges *every* registered data
> broker — 500+ of them — to delete your personal information, with penalties of
> $200 per request per day for non-compliance. That one action reaches further
> than every individual opt-out in this catalog combined. unlinkd ships a DROP
> connector and tracks the request against its statutory window; it does not
> submit the request for you.

## Product Requirements

- `docs/PRD-digital-disappearance.md` — the **long-term vision**. Much of it is
  intentionally aspirational; see *Implementation status* below for what is
  actually shipped today.

## Reports & governance

- `docs/code-quality-report.md`
- `docs/connector-governance.md` — how the connector catalog is reviewed and
  kept fresh.

## Implementation status

Shipped today:

- Encrypted local vault and evidence store (IndexedDB). New data is encrypted
  with AES-256-GCM under a key derived by **memory-hard scrypt** from your
  passphrase. Older PBKDF2 and legacy (unversioned SHA-256) envelopes are still
  read for migration, and the vault is proactively re-encrypted with scrypt on
  the next unlock; evidence payloads written before the migration keep their
  original envelope until re-added. KDF cost parameters read from stored or
  imported envelopes are bounded, so a hostile envelope cannot peg the tab with
  absurd work factors.
- **HMAC-chained audit log**, keyed by a passphrase-derived key and verified
  automatically on unlock. See *Security model* below for exactly what this does
  and does not protect against.
- Passphrase-protected unlock with a create-vault flow (confirm + strength
  meter) and an explicit "no recovery" wipe path (now behind a two-step
  confirmation). Because there is no recovery, **export an encrypted backup
  regularly** (Backup tab) — browser storage can be cleared by a reinstall, OS
  reset, or storage eviction.
- **Lock button + auto-lock**: the decrypted vault and passphrase are cleared
  from memory on demand or after 15 minutes of inactivity.
- **Durability safeguards**: persistent-storage request on unlock, storage
  usage/quota and persistence state in the Backup tab, and backup-staleness
  warnings on the Dashboard.
- **Cross-tab safety**: compare-and-swap on vault writes, retry-on-conflict for
  audit appends, and BroadcastChannel sync between open tabs.
- **Connector freshness surfaced in-app**: connectors past the 90-day review
  cadence are badged unverified, with a catalog-level count.
- **Evidence re-encryption**: evidence written under an older KDF can be
  upgraded to the current memory-hard scrypt envelope from the Backup tab.
- **First-run onboarding wizard**: after creating a vault, a guided setup adds
  identifiers, imports accounts from a password-manager CSV, and suggests
  connector workflows.
- **Removal-request tracking with statutory deadlines**: record when a request
  was sent, to whom and under which right, and the app computes when the
  operator is late. Ships GDPR/UK GDPR (one month, extendable by two under Art.
  12(3)), CCPA/CPRA (45 days, extendable by 45), California DROP (90 days) and a
  generic US state profile (45 days, extendable by 45) for the ~20 states with a
  comprehensive privacy law but no central portal.
  Deadlines are computed rather than stored, always shown with their citation
  and arithmetic, and marked unverified when the compliance profile is past its
  review date.
- **Honest coverage reporting**: progress is stated against the registered data
  broker population (500+, per the California registry), not against the size of
  this catalog — because clearing every connector here still leaves most brokers
  holding your data.
- Persona management and cross-persona reuse policy warnings.
- Identifier ingestion with validation/normalization and policy limits.
- Heuristic local scan (consent-aware) producing prioritized risk findings.
- Findings status workflow (open → in progress → mitigated).
- Have I Been Pwned integration (Settings tab): optional breach lookup during
  scans via a stored API key, plus a free k-anonymity password breach check and
  manual exposure-check suggestions.
- Signed connector catalog feed + in-app update/import, with a freshness policy.
- Account discovery imports (password-manager CSV + mailbox discovery).
- Encrypted backup export/import (import is validated as ciphertext and is
  non-destructive: a malformed or wrong-passphrase backup is rejected before any
  existing data is touched) and exportable Markdown reports.
- Optional local Playwright agent for **evidence capture** (see the honest
  scope note below).

Not yet built (tracked in the PRD as future work): cross-device sync, MFA
posture scoring, recovery-factor enforcement, and the self-hosted
infrastructure/network stack. Jurisdiction compliance profiles now exist for
deadline tracking (GDPR, CCPA, California DROP), but they do not yet drive
per-jurisdiction connector selection or request wording.

### Honest scope

**"Connector automation":** the catalog is overwhelmingly
*guided manual checklists*. A small number of connectors carry agent steps, and
today those steps **only navigate to a URL and take a screenshot** — they do not
fill forms, submit opt-outs, or change account settings. The agent captures
*evidence*; it does not yet *perform removals*. Real opt-out automation is
tracked as future work.

**A registry is not a remedy.** Four states publish a data broker registry
(California, Texas, Oregon, Vermont; Connecticut from 2027), but only California
pairs one with a central deletion portal. Texas and Oregon give a deletion right
that must still be exercised broker by broker, and Vermont's registry carries no
deletion right at all. Outside those states — and across the EU and UK — deletion
remains one request per operator. The dashboard says so rather than implying
otherwise.

**Catalog coverage is a fraction of the problem.** The catalog carries a few
dozen brokers; the California registry alone lists 500+. Working through every
connector here would still leave most registered brokers holding your data,
which is why the dashboard states coverage against the registry rather than
against the catalog, and why DROP is surfaced ahead of individual opt-outs for
Californians.

**Deadlines are informational, not legal advice.** Statutory windows are modelled
from published guidance, dated, and shown with the citation and arithmetic behind
them so you can check any figure before relying on it. Confirm the window that
applies to you before escalating to a regulator.

## Security model

Plain statement of what the local-first design does and does not protect:

- **Confidentiality at rest.** All sensitive state is AES-256-GCM encrypted under
  a key derived from your passphrase with memory-hard scrypt. If someone copies
  your browser storage **without** your passphrase, the data is not readable; the
  only attack is offline guessing of the passphrase, which scrypt makes costly.
  Choose a strong passphrase — it is the single secret protecting everything.
- **Audit-log integrity.** Records are chained with an HMAC keyed by a
  passphrase-derived key, stored only as authenticated ciphertext, and verified
  on unlock. An attacker who can write your browser storage but does **not** know
  the passphrase cannot forge or alter records. The vault (a separate encrypted
  store from the audit log) also remembers the tip of the audit chain and
  cross-checks it on unlock, so wholesale deletion or replacement of the audit
  blob — which the per-record HMAC chain alone can't notice, since an empty or
  reset log is still internally "consistent" — is now detected too. Limit:
  anyone who knows your passphrase can still forge the log (unavoidable for a
  local-only tool with no external notary).
- **Connector feed authenticity.** The remote catalog must carry a valid Ed25519
  signature (the public key is bundled at build time); the app fails closed if no
  key is configured, and rejects feeds older than the cached version. Manually
  *imported* connector packs are unsigned and shown as unverified — only import
  packs you trust.
- **Not protected against:** a device already compromised while unlocked (malware,
  a malicious browser extension, or someone with your passphrase). XSS is
  mitigated by a strict CSP but would be serious if it occurred. This is not a
  tool for use on a device shared with your adversary.
- **Durability, not just confidentiality.** The realistic way to lose this data
  is browser eviction, not an attacker. unlinkd requests persistent storage on
  unlock and reports whether it was granted (Backup tab), but the only durable
  copy is an exported backup — the app warns when the last one is over 14 days
  old.
- **Multi-tab writes are guarded, not merged.** Vault saves use a
  compare-and-swap against the stored ciphertext, and audit appends retry on top
  of a concurrent writer's chain, so a second tab can no longer silently destroy
  the first tab's work. Tabs also announce writes to each other and re-read.
  What is *not* provided is field-level merging: if two tabs edit concurrently,
  the loser is told its change was not saved and is refreshed, rather than being
  merged automatically.

## Feature summary

- Encrypted local vault (personas, identifiers, accounts, connectors, findings).
- Removal-request records with computed statutory deadlines (GDPR, CCPA, California DROP).
- Broker coverage stated against the registered-broker population, not the catalog.
- Persona management and cross-persona reuse policy warnings.
- Identifier ingestion with consent-aware records.
- Input validation and normalization for identifier values.
- Policy checks for duplicate identifiers and maximum ingestion limits.
- Consent-bounded exposure graph modeling.
- Hash-chained, encrypted local audit trail (integrity verifiable).
- Risk finding prioritization by threat tier.
- Connector catalog + workflow transition validation.
- Connector catalog update feed (signed) + in-app update/import.
- Encrypted evidence vault (IndexedDB) for files and notes.
- Exportable markdown reports (redacted vs full).
- Encrypted backup export/import (vault + audit + evidence ciphertext-only).
- Local heuristic scan to generate initial findings.
- Account discovery imports (password manager CSV + mailbox discovery).
- Agent job export/import hooks for local browser automation.

## Configuration

Copy `.env.example` and adjust values as needed:

```bash
cp .env.example .env
```

- `VITE_MAX_IDENTIFIERS`: maximum number of identifiers that can be stored locally.
- `VITE_IDENTIFIER_RETENTION_DAYS`: legacy identifier storage retention (not currently enforced by the vault model).
- `VITE_CONNECTOR_FEED_URL`: connector catalog feed URL (default: `/connectors/catalog.v1.json`).
- `VITE_CONNECTOR_FEED_PUBKEY`: base64 Ed25519 public key for verifying the feed signature.

## Quick Start

```bash
npm install
npm run dev
```

## Quality Checks

```bash
npm run lint
npm test
npm run build
npm run test:e2e:ci
npm audit --omit=dev --audit-level=moderate   # production deps that actually ship
npm audit --audit-level=moderate              # informational: includes dev-only toolchain
```

CI gates on the production-dependency audit (what is served to users) and runs
the full audit as informational, so a transitive advisory in the build
toolchain (vite/playwright) does not falsely red-flag the shipped app.

## Deploy (Cloudflare Pages)

This app is a static Vite build (`dist/`) and is suitable for Cloudflare Pages.

Notes:
- SPA routing and security headers are configured via `public/_redirects` and `public/_headers`.
- Set `VITE_MAX_IDENTIFIERS` / `VITE_IDENTIFIER_RETENTION_DAYS` in your Pages project build environment if you want non-default values.

### Recommended: Git Integration (No API Tokens)

Cloudflare Pages can connect to GitHub directly via the dashboard (no `CLOUDFLARE_API_TOKEN` needed).

1. Cloudflare Dashboard → Workers & Pages → **Create application** → **Pages** → **Connect to Git**
2. Select repo: `gr8monk3ys/unlinkd`
3. Build settings:
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Production branch: `main`

### Manual: Wrangler CLI (OAuth)

```bash
npx wrangler whoami
npm run build
npx wrangler pages deploy ./dist --project-name unlinkd
```

## CI

GitHub Actions workflow (`.github/workflows/ci.yml`) runs lint, tests, build, and dependency audit checks for push and pull request events.

## Connector Catalog Feed

The app can fetch a signed connector catalog feed from `public/connectors/` and cache it locally.

To publish a new feed version:

```bash
npm run connectors:keygen   # one-time, writes .secrets/connector-feed-key.json (DO NOT COMMIT)
npm run connectors:publish -- --version 2026-02-15
```

Commit the updated `public/connectors/catalog.v1.json` + `public/connectors/catalog.v1.sig`.

## Local Agent (Playwright)

The optional local agent runs Playwright on your machine to automate connector steps and capture encrypted evidence payloads (for example screenshots). Nothing is uploaded to a server; the agent outputs JSON you import back into the web app.

1. In the app, add a connector instance that has agent steps and click **Export Agent Job**.
2. Run the agent locally:

```bash
cd agent
npm install
npm run install:browsers

export UNLINKD_PASSPHRASE="your-vault-passphrase"
node src/cli.mjs run /path/to/unlinkd-agent-job.json --set targetUrl=https://example.com --out results.json
```

3. In the app, use **Import Agent Results (JSON)** to attach the evidence to the connector instance.

Mailbox discovery for large `.mbox` files (generates an accounts CSV you can import in the app):

```bash
cd agent
npm install
node src/cli.mjs mbox-discover /path/to/mailbox.mbox --out accounts.csv --max-messages 50000
```

## API Notes

### `buildExposureGraph(identifiers)`
Builds a local graph from consented identifiers and inferred linkage edges.

### `validateIdentifierInput(type, value)`
Validates identifier type/value pairs and returns normalized values for safe ingestion.

### `unlockVault(passphrase)` / `saveVault(state, passphrase)`
Unlocks and persists the encrypted vault state used by the UI.

### `exportBackup()` / `importBackup(payload)`
Exports and imports ciphertext-only backups (vault + audit + evidence payloads).

### `putEvidencePayload(id, payload)` / `getEvidencePayload(id)`
Stores and retrieves encrypted evidence payloads from IndexedDB.

### `appendAuditRecord(action, details)` / `verifyAuditChain()`
Appends hash-chained audit entries and verifies chain integrity.

### `hasDuplicateIdentifier(...)` / `canAddIdentifier(...)`
Applies local policy checks before ingesting new identifiers.

### `scoreFinding(finding)` / `sortFindingsByPriority(findings)`
Ranks findings with a deterministic formula (weighted harm/exploitability ×
threat-tier × status). Note: the harm/exploitability/tier inputs are currently
**fixed constants per finding type** in the scan heuristics, not per-user risk
modeling — the score is a stable severity ordering, not an estimate of your
individual risk.

### `nextStates(current)` / `canTransition(from, to)`
Provides allowed connector state transitions for deletion/remediation orchestration.
