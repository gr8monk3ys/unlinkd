import { describe, expect, it } from 'vitest';
import { appendAuditRecord, loadAuditRecords, verifyAuditChain } from './audit';

describe('audit', () => {
  it('appends records and verifies an untampered chain', async () => {
    await appendAuditRecord('identifier_added', 'email:hash', 'passphrase');
    await appendAuditRecord('identifier_rejected', 'duplicate username', 'passphrase');

    const records = await loadAuditRecords('passphrase');
    expect(records).not.toBeNull();
    expect(records).toHaveLength(2);
    await expect(verifyAuditChain('passphrase')).resolves.toBe(true);
  });

  it('fails verification after tampering', async () => {
    await appendAuditRecord('identifier_added', 'username:hash', 'passphrase');

    const records = await loadAuditRecords('passphrase');
    expect(records).not.toBeNull();
    const tampered = [{ ...records![0], details: 'tampered' }];
    localStorage.setItem('unlinkd.audit.v1', JSON.stringify(tampered));

    await expect(verifyAuditChain('passphrase')).resolves.toBe(false);
  });
});
