# Connector Catalog Governance

Connectors encode real-world, provider-specific instructions (data-broker
opt-out flows, account hardening/deletion steps, search self-checks). This
content rots: providers change form URLs, verification requirements, and
deletion paths. Stale instructions are worse than no instructions because users
trust them. This document defines how the catalog is reviewed and kept fresh.

## Source of truth

- `connectors/catalog.source.json` is the authored catalog.
- It is validated, sorted, and signed into `public/connectors/catalog.v1.json`
  (+ `.sig`) by `npm run connectors:publish`.
- The app verifies the Ed25519 signature before trusting a fetched feed and
  merges it over a small builtin fallback (`src/connectors/catalog.ts`).

## Required metadata

Every connector **must** declare:

- `id`, `name`, `category`, `description`
- `defaultRecheckDays` — how often a completed instance is re-checked
- `steps` — at least one `manual` or `agent` step
- `lastReviewed` — ISO date (`YYYY-MM-DD`) the content was last verified
  against the live provider

`lastReviewed` is the freshness signal. Update it (only) when you have actually
re-verified the steps against the provider — not on unrelated edits.

## Review cadence

- **Quarterly (90 days):** each connector should be re-verified. The freshness
  check warns when a connector exceeds this age.
- **Hard ceiling (365 days):** a connector older than this fails CI. At that
  point it must be re-reviewed or removed.

These thresholds live in `scripts/connectors_check_freshness.mjs` and
`src/connectors/catalog.freshness.test.ts`.

## Compliance profiles

The statutory deadline profiles in `src/core/compliance/profiles.ts` carry the
same kind of perishable claim as connector steps, and follow the same contract:

- Each profile has a `lastReviewed` date and a `sourceUrl`.
- **Half-yearly (180 days):** re-check the response windows against the statute
  or regulator guidance. `PROFILE_REVIEW_CADENCE_DAYS` sets the threshold.
- Past the cadence, deadlines computed from that profile still render, but are
  labelled unverified in the UI rather than presented as settled.

A wrong deadline is worse than a missing one: a user may act on it. Update
`lastReviewed` only after re-reading the source, and record the citation on each
basis so the figure can be checked from the UI.

## Checks

```bash
# Fails on missing/invalid lastReviewed or connectors past the hard ceiling;
# warns on connectors past the 90-day cadence.
node scripts/connectors_check_freshness.mjs

# The same invariants run as part of the test suite.
npm test
```

## Adding or updating a connector

1. Edit `connectors/catalog.source.json`. Keep steps least-privilege and
   provider-accurate; prefer first-party deletion/opt-out flows.
2. Set `lastReviewed` to today's date after verifying against the live site.
3. Run `node scripts/connectors_check_freshness.mjs` and `npm test`.
4. Publish: `npm run connectors:publish -- --version YYYY-MM-DD`, then commit
   the regenerated `public/connectors/catalog.v1.json` and `.sig`.

## Provenance

- Feed artifacts are signed; the public key ships in the app config
  (`VITE_CONNECTOR_FEED_PUBKEY`). Only signed feeds are trusted for automatic
  updates. Unsigned packs can still be imported manually but are surfaced in the
  UI as unverified.
