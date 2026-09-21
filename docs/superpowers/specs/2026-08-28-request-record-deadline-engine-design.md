# Design: Request Record and Statutory Deadline Engine

**Date:** 2026-08-28
**Status:** Proposed
**Sub-project:** 1 of 4 (case-management loop)

## Problem

unlinkd's premise is that proving a removal request is harder than making one.
The app does not yet keep the fact that would carry that proof. A
`ConnectorInstance` (`src/core/types.ts`) records `state`, `nextCheckAt`,
`evidence[]`, and one free-text `notes` field. Nothing records *when a request
was sent, to whom, or under which legal right*. The workflow has an `executed`
state, but it cannot distinguish a button press from a request transmitted on a
particular date under GDPR Art. 17.

The consequence is that the app goes quiet at exactly the point where a user
needs it most. A broker's default behaviour is silence, and a user who cannot
say "you are eleven days past your statutory deadline" has no leverage. Every
downstream feature — a request composer, reply ingestion, an escalation
packet — needs this record to exist first.

## Scope

In scope: the request/response record, a compliance-profile registry, a pure
deadline engine, and a Dashboard worklist that surfaces what is overdue.

Out of scope, tracked as later sub-projects: composing and sending the request
(2), parsing broker replies (3), and generating a regulator complaint (4).

Requests are entered manually in this sub-project. That is deliberate — the
feature is useful the moment a user can type "I sent this on the 14th", and it
lets the data model settle before automation is built on it.

## Sub-project decomposition

| # | Sub-project | Depends on |
|---|---|---|
| 1 | Request record + statutory deadline engine | — |
| 2 | Request composer (jurisdiction-correct templates) | 1 |
| 3 | Reply ingestion (`.eml` parse + classification) | 1 |
| 4 | Escalation packet generator | 1, 2, 3 |

## Design principles

Two constraints shape everything below.

**Deadlines are computed, never stored.** Only facts are persisted: `sentAt`,
which compliance profile applies, and whether the controller claimed an
extension. The due date is derived by a pure function on read. A persisted due
date silently goes stale the moment a profile is corrected, and displaying a
wrong legal deadline to a user who then relies on it is the most damaging bug
this product could ship.

**Compliance profiles are as perishable as connector instructions.** Statutory
guidance moves. Profiles therefore carry `lastReviewed` and go stale on a
cadence, reusing the contract already established for connectors in
`src/core/connectors.ts` (`isConnectorStale`, `CONNECTOR_REVIEW_CADENCE_DAYS`).
A deadline computed from a stale profile is shown as unverified.

The vault holds working state; the audit log holds the tamper-evident record of
what happened. Request events append to the audit log as *proof*, but product
state is never derived by parsing it.

## Data model

Added to `src/core/types.ts`:

```ts
export type RequestChannel = 'web_form' | 'email' | 'postal' | 'phone' | 'in_app';

export type RequestOutcome =
  | 'awaiting'           // sent, nothing back yet
  | 'acknowledged'       // replied, work in progress
  | 'completed'          // removal confirmed
  | 'refused'            // denied
  | 'identity_required'  // blocked pending ID verification
  | 'no_response';       // deadline passed in silence

export interface RequestResponse {
  id: string;
  receivedAt: string;
  outcome: RequestOutcome;
  note?: string;
  /** Links to an EvidenceMeta record holding the reply itself. */
  evidenceId?: string;
  /** Set when the controller invoked a statutory extension. */
  extensionClaimed?: boolean;
}

export interface RemovalRequest {
  id: string;
  /** Compliance profile the deadline is computed under, e.g. 'gdpr'. */
  profileId: string;
  /** The specific right exercised, e.g. 'gdpr.art17'. */
  basisId: string;
  channel: RequestChannel;
  /** The address or URL actually used. */
  recipient?: string;
  /** The fact the clock runs from. */
  sentAt: string;
  responses: RequestResponse[];
  /** User override for cases where the real deadline differs. */
  dueAtOverride?: string;
  closedAt?: string;
  notes?: string;
}
```

`ConnectorInstance` gains `requests?: RemovalRequest[]`.

Making the field optional is what makes this backward compatible. The vault is
validated by zod (`connectorInstanceSchema` in `src/core/vault.ts`), so
`requests: z.array(removalRequestSchema).optional().default([])` loads every
existing vault unchanged and needs no migration step.

### Why requests live on the instance

The alternative was a top-level `requests[]` on `VaultStateV1`, mirroring
`findings[]`. Nesting won because everything about one broker stays in one
place, which is how users think about it and how `buildMarkdownReport` already
traverses the vault. Nesting also removes orphan management: deleting an
instance takes its requests with it. Cross-connector queries are a `flatMap`
over a few dozen items, which costs nothing at this scale.

A third option — deriving deadlines from the audit log, which already timestamps
`connector_state_changed` — was rejected. `AuditRecord.details` is free text
rather than structured data; the log is append-only, so a user could never
correct a mistyped send date; and `executed` captures no jurisdiction, basis, or
recipient. It would couple everyday UI state to forensics.

## Compliance profiles

New module `src/core/compliance/profiles.ts`, data-driven so new regimes arrive
as data rather than code:

```ts
export interface ComplianceBasis {
  id: string;        // 'gdpr.art17'
  label: string;     // 'Right to erasure'
  citation: string;  // 'GDPR Art. 17'
  responseWindow: { value: number; unit: 'days' | 'months' };
  /** Additional window the controller may claim with notice. */
  extensionWindow?: { value: number; unit: 'days' | 'months' };
  extensionNote?: string;
}

export interface ComplianceProfile {
  id: string;
  name: string;
  jurisdictions: string[];
  bases: ComplianceBasis[];
  /** YYYY-MM-DD. Same freshness contract as connectors. */
  lastReviewed: string;
  sourceUrl: string;
}
```

Shipped at launch:

- **gdpr** — GDPR / UK GDPR. Art. 17 erasure, Art. 15 access, Art. 21
  objection. One month, extendable by two further months with notice under
  Art. 12(3).
- **ccpa** — CCPA / CPRA. Deletion, right to know, opt-out of sale or sharing.
  45 days, extendable by a further 45 with notice.

The unit matters. GDPR specifies *one calendar month*, not thirty days, so
month arithmetic must clamp at month ends: 31 January plus one month is
28 or 29 February. Treating that as 30 days produces a date that is wrong in
roughly half of all months.

## Deadline engine

New module `src/core/compliance/deadlines.ts` — pure, no I/O, no clock access
except an injected `now`, which makes it exhaustively testable.

```ts
export type DeadlineStatus = 'not_sent' | 'pending' | 'due_soon' | 'overdue' | 'closed';

export interface DeadlineComputation {
  status: DeadlineStatus;
  dueAt: string | null;
  /** Negative when overdue. */
  daysRemaining: number | null;
  basis: ComplianceBasis | null;
  /** Readable arithmetic backing the date, for the "show your work" UI. */
  explanation: string;
  extended: boolean;
  overridden: boolean;
  /** Profile is past its review cadence; present the deadline as unverified. */
  stale: boolean;
}

export function computeDeadline(
  request: RemovalRequest,
  profiles: ComplianceProfile[],
  now?: number,
): DeadlineComputation;

export function overdueRequests(
  vault: VaultStateV1,
  profiles: ComplianceProfile[],
  now?: number,
): Array<{ instance: ConnectorInstance; request: RemovalRequest; computation: DeadlineComputation }>;
```

Rules:

- A terminal outcome (`completed`, `refused`) closes the request and stops the
  clock.
- `extensionClaimed` on any response extends the window from `sentAt` by base
  plus extension — not from the acknowledgement date.
- `dueAtOverride` beats the computed value and sets `overridden`.
- `due_soon` fires within an exported `DUE_SOON_DAYS` threshold of 7.
- An unknown `profileId` or `basisId` returns `dueAt: null` with an explanation
  naming the missing profile. It never throws: one bad reference must not take
  down the Dashboard.

## Dashboard worklist

`DashboardTab` gains a "Needs attention" section above the fold, merging three
sources into a single ranked list: overdue requests worst-first, then due-soon
requests, then due rechecks (already available via `dueConnectorInstances`).

Each row names the broker, what is overdue, by how long, and the one action to
take. The deadline displays its citation, with the `explanation` string
available on demand — "Sent 14 Jul 2026, plus one month under GDPR Art. 12(3),
due 14 Aug 2026". Showing the arithmetic is what makes the number trustworthy.

This is the surface that answers "what do I do today", and it is the reason a
user opens the app on day 30 rather than abandoning it on day 2.

## Audit and UI wiring

Three actions join `auditActions` in `src/core/audit.ts`: `request_sent`,
`request_response_recorded`, `request_closed`.

`ConnectorsTab` gains a "Record a request" form (channel, profile, basis, sent
date, recipient) and a per-request timeline with a "Record response" action.

`buildMarkdownReport` gains a request timeline per connector, which is the first
draft of the evidence exhibit that sub-project 4 will formalise.

## Legal accuracy

The app will state legal deadlines to people who act on them, so the design
treats accuracy as a feature rather than a disclaimer:

- Every deadline shows its citation and its arithmetic.
- Profiles carry `sourceUrl` and `lastReviewed`; a stale profile badges its
  deadlines as unverified rather than hiding them.
- The user can always override a computed date.
- Copy is informational and says so; it is not legal advice.
- CI gains a freshness gate on profile review dates, alongside the existing
  connector check in `scripts/connectors_check_freshness.mjs`.

## Error handling

- Missing or unknown profile: soft-fail with a null deadline and an explanation.
- `sentAt` in the future: rejected at validation.
- Unparseable dates: treated as unknown, never propagating `NaN` into the UI.
- Existing vaults: load unchanged via the optional-with-default schema.
- Concurrent edits: unchanged: requests ride the existing compare-and-swap vault
  write, so a second tab is told its write lost rather than clobbering.

## Testing

- `deadlines.test.ts` — month-end clamping (31 Jan + 1 month), leap years,
  extension arithmetic, override precedence, terminal outcomes, unknown
  profiles, stale profiles, and DST/timezone boundaries.
- `profiles.test.ts` — every shipped profile validates, every basis carries a
  citation, every `lastReviewed` parses.
- `vault.test.ts` — a pre-existing vault without `requests` round-trips.
- Component — worklist ranking and rendering.
- E2E — record a request dated in the past, assert the Dashboard shows it
  overdue with its citation.

## Files

New: `src/core/compliance/profiles.ts`, `src/core/compliance/deadlines.ts`,
`src/core/compliance/requests.ts`, plus tests.

Modified: `src/core/types.ts`, `src/core/vault.ts`, `src/core/audit.ts`,
`src/core/report.ts`, `src/components/tabs/DashboardTab.tsx`,
`src/components/tabs/ConnectorsTab.tsx`, `src/components/useUnlinkdApp.ts`.

`useUnlinkdApp.ts` is already 1568 lines. Request handling goes into a separate
`useRemovalRequests` hook composed into it rather than growing that file
further.
