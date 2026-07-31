import { describe, expect, it } from 'vitest';
import { appendAuditRecord, auditChainTipMatches, computeAuditChainTip, loadAuditRecords, verifyAuditChain } from './audit';
import { encryptJson, sha256Hex } from './crypto';

const AUDIT_KEY = 'unlinkd.audit.v1';

async function writeEncryptedEnvelope(records: unknown[], passphrase: string): Promise<void> {
  const encrypted = await encryptJson({ version: 1, records }, passphrase);
  localStorage.setItem(AUDIT_KEY, JSON.stringify(encrypted));
}

describe('audit', () => {
  it('appends records and verifies an untampered chain', async () => {
    await appendAuditRecord('identifier_added', 'email:hash', 'passphrase');
    await appendAuditRecord('identifier_rejected', 'duplicate username', 'passphrase');

    const records = await loadAuditRecords('passphrase');
    expect(records).not.toBeNull();
    expect(records).toHaveLength(2);
    await expect(verifyAuditChain('passphrase')).resolves.toBe(true);
  });

  it('ignores an injected plaintext audit array (no-passphrase injection closed)', async () => {
    // An attacker who can write local storage but does not know the passphrase
    // tries to seed a forged history as a bare plaintext array. It must be
    // ignored rather than migrated/trusted.
    const forged = [
      { id: 'x', action: 'identifier_added', details: 'forged', timestamp: 't', previousHash: null, hash: 'deadbeef' }
    ];
    localStorage.setItem(AUDIT_KEY, JSON.stringify(forged));

    const records = await loadAuditRecords('passphrase');
    expect(records).toEqual([]);
    await expect(verifyAuditChain('passphrase')).resolves.toBe(true);
  });

  it('fails verification when a record is tampered in place', async () => {
    await appendAuditRecord('identifier_added', 'username:hash', 'passphrase');
    const records = await loadAuditRecords('passphrase');

    const tampered = [{ ...records![0]!, details: 'tampered' }]; // stale hash
    await writeEncryptedEnvelope(tampered, 'passphrase');

    await expect(verifyAuditChain('passphrase')).resolves.toBe(false);
  });

  it('does not drop a concurrent append made by another tab', async () => {
    await appendAuditRecord('identifier_added', 'first', 'passphrase');

    // Simulate a peer tab appending while this append is mid-flight: patch
    // encryptJson's timing surrogate by writing straight into storage after
    // this call has already read the envelope.
    const original = localStorage.getItem(AUDIT_KEY);
    expect(original).not.toBeNull();

    const racing = appendAuditRecord('scan_ran', 'ours', 'passphrase');
    // Peer write lands before ours commits.
    await appendAuditRecord('account_added', 'theirs', 'passphrase');
    await racing;

    const records = await loadAuditRecords('passphrase');
    const details = records!.map((record) => record.details);

    // Both appends must survive, and the chain must still verify.
    expect(details).toContain('theirs');
    expect(details).toContain('ours');
    expect(records).toHaveLength(3);
    await expect(verifyAuditChain('passphrase')).resolves.toBe(true);
  });

  it('fails verification even if the attacker recomputes an unkeyed hash', async () => {
    await appendAuditRecord('identifier_added', 'username:hash', 'passphrase');
    const records = await loadAuditRecords('passphrase');
    const record = records![0]!;
    const rewritten = 'rewritten by attacker';

    // The chain is now an HMAC keyed by a passphrase-derived key. Recomputing the
    // OLD unkeyed SHA-256 hash (all an attacker without that key could do) must
    // not verify.
    const forgedHash = await sha256Hex(`${record.id}:${record.action}:${rewritten}:${record.timestamp}:root`);
    await writeEncryptedEnvelope([{ ...record, details: rewritten, hash: forgedHash }], 'passphrase');

    await expect(verifyAuditChain('passphrase')).resolves.toBe(false);
  });
});

describe('audit chain tip (wholesale-deletion detection)', () => {
  it('computes null for an empty chain', () => {
    expect(computeAuditChainTip([])).toBeNull();
  });

  it('computes the id/hash of the last record', async () => {
    await appendAuditRecord('identifier_added', 'email:hash', 'passphrase');
    await appendAuditRecord('identifier_rejected', 'duplicate', 'passphrase');
    const records = (await loadAuditRecords('passphrase'))!;

    const tip = computeAuditChainTip(records);
    expect(tip).toEqual({ id: records[1]!.id, hash: records[1]!.hash });
  });

  it('treats a null (never-committed) tip as a match against anything, including an empty chain', () => {
    expect(auditChainTipMatches(null, [])).toBe(true);
  });

  it('matches when the committed record is still present, even after later appends', async () => {
    await appendAuditRecord('identifier_added', 'email:hash', 'passphrase');
    const firstBatch = (await loadAuditRecords('passphrase'))!;
    const tip = computeAuditChainTip(firstBatch)!;

    await appendAuditRecord('identifier_added', 'phone:hash', 'passphrase');
    const grown = (await loadAuditRecords('passphrase'))!;

    expect(auditChainTipMatches(tip, grown)).toBe(true);
  });

  it('fails to match once the committed record is gone (wholesale deletion of the audit blob)', async () => {
    await appendAuditRecord('identifier_added', 'email:hash', 'passphrase');
    const records = (await loadAuditRecords('passphrase'))!;
    const tip = computeAuditChainTip(records)!;

    // Attacker deletes the whole audit blob independent of the vault; the log
    // restarts empty. The per-record HMAC chain is trivially "intact" (there
    // is nothing to disprove), so only the tip cross-check catches this.
    expect(auditChainTipMatches(tip, [])).toBe(false);
  });

  it('fails to match against a differently-forged log even if it is the same length', async () => {
    await appendAuditRecord('identifier_added', 'email:hash', 'passphrase');
    const records = (await loadAuditRecords('passphrase'))!;
    const tip = computeAuditChainTip(records)!;

    const forged = [{ ...records[0]!, id: 'forged-id', hash: 'forged-hash' }];
    expect(auditChainTipMatches(tip, forged)).toBe(false);
  });
});
