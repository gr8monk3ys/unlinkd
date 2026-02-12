# unlinkd

A local-first MVP for personal digital disappearance workflows and OSINT self-scan tooling.

## Product Requirements

- `docs/PRD-digital-disappearance.md`

## Reports

- `docs/code-quality-report.md`

## MVP Features

- Identifier ingestion with consent-aware records.
- Input validation and normalization for identifier values.
- Encrypted local persistence for identifiers with retention control.
- Policy checks for duplicate identifiers and maximum ingestion limits.
- Consent-bounded exposure graph modeling.
- Hash-chained local audit trail for ingestion decisions.
- Risk finding prioritization by threat tier.
- Connector workflow transition validation.

## Configuration

Copy `.env.example` and adjust values as needed:

```bash
cp .env.example .env
```

- `VITE_MAX_IDENTIFIERS`: maximum number of identifiers that can be stored locally.
- `VITE_IDENTIFIER_RETENTION_DAYS`: retention window for local identifier storage.

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

## CI

GitHub Actions workflow (`.github/workflows/ci.yml`) runs lint, tests, build, and dependency audit checks for push and pull request events.

## API Notes

### `buildExposureGraph(identifiers)`
Builds a local graph from consented identifiers and inferred linkage edges.

### `validateIdentifierInput(type, value)`
Validates identifier type/value pairs and returns normalized values for safe ingestion.

### `loadIdentifiers(retentionDays, passphrase)` / `saveIdentifiers(identifiers, passphrase)`
Loads and stores local identifier records with retention-aware, encrypted browser storage.

### `appendAuditRecord(action, details)` / `verifyAuditChain()`
Appends hash-chained audit entries and verifies chain integrity.

### `hasDuplicateIdentifier(...)` / `canAddIdentifier(...)`
Applies local policy checks before ingesting new identifiers.

### `scoreFinding(finding)` / `sortFindingsByPriority(findings)`
Scores and ranks findings using weighted harm and exploitability with a threat-tier multiplier.

### `nextStates(current)` / `canTransition(from, to)`
Provides allowed connector state transitions for deletion/remediation orchestration.
