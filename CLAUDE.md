# unlinkd

## Agent skills

### Issue tracker

GitHub Issues on `gr8monk3ys/unlinkd`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, label string equal to role name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Checks

`npm run check` runs lint, typecheck, dependency-cruiser boundaries, tests and build. Existing boundary violations are baselined in `.dependency-cruiser-known-violations.json`; do not add to it.
