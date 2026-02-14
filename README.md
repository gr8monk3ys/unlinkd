# unlinkd

A local-first MVP for personal digital disappearance workflows and OSINT self-scan tooling.

## Product Requirements

- `docs/PRD-digital-disappearance.md`

## Reports

- `docs/code-quality-report.md`

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
- Encrypted evidence vault (IndexedDB) for files and notes.
- Exportable markdown reports (redacted vs full).
- Encrypted backup export/import (vault + audit + evidence ciphertext-only).
- Local heuristic scan to generate initial findings.

## Configuration

Copy `.env.example` and adjust values as needed:

```bash
cp .env.example .env
```

- `VITE_MAX_IDENTIFIERS`: maximum number of identifiers that can be stored locally.
- `VITE_IDENTIFIER_RETENTION_DAYS`: legacy identifier storage retention (not currently enforced by the vault model).

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
