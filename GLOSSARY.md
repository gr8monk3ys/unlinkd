# unlinkd

A local-first workspace for getting removed from data brokers and accounts and keeping provable evidence of each request. All state lives encrypted in the browser.

## Language

### Identity

**Persona**:
A named identity under which identifiers, accounts and connector instances are grouped.
_Avoid_: Profile, user

**Identifier**:
A piece of personal data (legal name, email, phone, username, address, device) attached to a persona, with a sensitivity and a consent flag.
_Avoid_: PII field, attribute

**Account**:
An online service login a persona holds, with a status of active, unused, removed or unknown.
_Avoid_: Profile, membership

### Exposure

**Exposure graph**:
The nodes and edges linking identifiers and accounts through reuse (email reuse, username reuse, phone recovery, device fingerprint).
_Avoid_: Link map

**Finding**:
A scored risk (harm, exploitability, tier) with a status of open, in progress or mitigated.
_Avoid_: Alert, issue

**Threat tier**:
The low, moderate or high bucket a finding falls into.
_Avoid_: Severity

### Removal

**Connector**:
A catalog entry describing one removal workflow (broker, account, search or other) as an ordered list of manual or agent steps.
_Avoid_: Integration, plugin

**Connector catalog**:
The set of connectors, built in or merged from a signed feed or imported pack. Imported packs are unsigned and shown unverified.
_Avoid_: Registry

**Connector instance**:
A persona's run of one connector, moving through the states discovered, verified, user approved, executed, proof captured, recheck scheduled.
_Avoid_: Job, task

**Recheck**:
The scheduled revisit of an executed connector instance to confirm the data has not been re-listed.
_Avoid_: Retry

**Stale connector**:
A connector past the 90-day review cadence, shown as unverified.
_Avoid_: Outdated connector

**Agent job**:
An exported description of agent steps for a connector instance, run outside the app; its results are imported back as findings and evidence.
_Avoid_: Automation run

### Proof

**Evidence**:
An encrypted artifact (screenshot, pdf, email, note, file) attached to a connector instance, stored with a sha256.
_Avoid_: Attachment, proof file

**Audit log**:
The HMAC-chained, append-only record of every action taken, verified on unlock.
_Avoid_: History, activity log

**Audit chain tip**:
The hash of the latest audit record, stored in the vault so wholesale deletion of the audit log is detected.
_Avoid_: Checkpoint

**Vault**:
The single passphrase-encrypted state holding personas, identifiers, accounts, connector instances, findings and settings.
_Avoid_: Database, store

**Backup**:
An encrypted export file of the vault and evidence, imported to restore.
_Avoid_: Snapshot

### Compliance

**Removal request**:
One erasure or removal request sent to an operator, recording channel, recipient, sent date, responses and optional due-date override.
_Avoid_: Ticket, case

**Compliance profile**:
A legal regime (GDPR, CCPA/CPRA, California DROP, generic US state) with its response windows, citation and last-reviewed date.
_Avoid_: Policy, ruleset

**Compliance basis**:
A specific right within a profile, such as `gdpr.art17`, carrying a response window and optional extension.
_Avoid_: Right, article

**Deadline**:
The computed due date of a removal request, derived from sent date and basis and never stored.
_Avoid_: SLA, due date

**Extension**:
Extra time an operator may claim, recorded as a claim about the clock rather than an outcome.
_Avoid_: Delay

**DROP**:
California's Delete Request and Opt-out Platform, one verified request that obliges every registered broker to delete.
_Avoid_: CA portal

**Coverage**:
How much of the registered broker universe the user has reached, including DROP status.
_Avoid_: Progress
