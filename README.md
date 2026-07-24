# unlinkd

A local-first MVP for personal digital disappearance workflows and OSINT self-scan tooling.

It runs entirely in the browser: all data (personas, identifiers, accounts,
connectors, findings, evidence, audit log) is encrypted with your passphrase and
stored locally. There is no backend and no account.

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
  passphrase (older PBKDF2 envelopes are still read for migration).
- **HMAC-chained audit log**, keyed by a passphrase-derived key and verified
  automatically on unlock. See *Security model* below for exactly what this does
  and does not protect against.
- Passphrase-protected unlock with a create-vault flow (confirm + strength
  meter) and an explicit "no recovery" wipe path. Because there is no recovery,
  **export an encrypted backup regularly** (Backup tab) — browser storage can be
  cleared by a reinstall, OS reset, or storage eviction.
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
posture scoring, recovery-factor enforcement, jurisdiction compliance profiles,
and the self-hosted infrastructure/network stack.

**Honest scope of "connector automation":** the catalog is overwhelmingly
*guided manual checklists*. A small number of connectors carry agent steps, and
today those steps **only navigate to a URL and take a screenshot** — they do not
fill forms, submit opt-outs, or change account settings. The agent captures
*evidence*; it does not yet *perform removals*. Real opt-out automation is
tracked as future work.

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

## MVP Features

- Encrypted local vault (personas, identifiers, accounts, connectors, findings).
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
