import { describe, expect, it } from 'vitest';
import { appendAuditRecord, getAuditRecords, verifyAuditChain } from './audit';

describe('audit', () => {
  it('appends records and verifies an untampered chain', async () => {
    await appendAuditRecord('identifier_added', 'email:user@example.com');
    await appendAuditRecord('identifier_rejected', 'duplicate username');

    const records = getAuditRecords();
    expect(records).toHaveLength(2);
    await expect(verifyAuditChain()).resolves.toBe(true);
  });

  it('fails verification after tampering', async () => {
    await appendAuditRecord('identifier_added', 'username:alias');

    const records = getAuditRecords();
    const tampered = [{ ...records[0], details: 'tampered' }];
    localStorage.setItem('unlinkd.audit.v1', JSON.stringify(tampered));

    await expect(verifyAuditChain()).resolves.toBe(false);
  });
});
