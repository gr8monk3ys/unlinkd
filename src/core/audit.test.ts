import { describe, expect, it } from 'vitest';
import { appendAuditRecord, loadAuditRecords, verifyAuditChain } from './audit';
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
