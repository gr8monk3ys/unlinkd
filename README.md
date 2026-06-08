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

- Encrypted local vault, evidence store (IndexedDB), and hash-chained audit log.
- Passphrase-protected unlock with a create-vault flow (confirm + strength
  meter) and an explicit "no recovery" wipe path.
- Persona management and cross-persona reuse policy warnings.
- Identifier ingestion with validation/normalization and policy limits.
- Heuristic local scan (consent-aware) producing prioritized risk findings.
- Findings status workflow (open → in progress → mitigated).
- Have I Been Pwned integration (Settings tab): optional breach lookup during
  scans via a stored API key, plus a free k-anonymity password breach check and
  manual exposure-check suggestions.
- Signed connector catalog feed + in-app update/import, with a freshness policy.
- Account discovery imports (password-manager CSV + mailbox discovery).
- Encrypted backup export/import and exportable Markdown reports.
- Optional local Playwright agent for connector automation/evidence capture.

Not yet built (tracked in the PRD as future work): cross-device sync, MFA
posture scoring, recovery-factor enforcement, jurisdiction compliance profiles,
and the self-hosted infrastructure/network stack. Connector *automation* is
still the minority of the catalog — most connectors are guided manual
checklists, with a small set of agent-automated evidence-capture connectors
(navigate + screenshot of a broker listing, self-search results, or account
security settings) run via the optional local Playwright agent.

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
npm audit --audit-level=moderate
```

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
Scores and ranks findings using weighted harm and exploitability with a threat-tier multiplier.

### `nextStates(current)` / `canTransition(from, to)`
Provides allowed connector state transitions for deletion/remediation orchestration.
