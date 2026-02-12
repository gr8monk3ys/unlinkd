import { describe, expect, it } from 'vitest';
import { loadIdentifiers, saveIdentifiers } from './storage';

describe('storage', () => {
  it('loads saved identifiers when envelope is fresh', async () => {
    await saveIdentifiers([{ id: '1', type: 'email', value: 'a@a.com', sensitivity: 2, consent: true }], 'passphrase');

    const loaded = await loadIdentifiers(90, 'passphrase');
    expect(loaded).toHaveLength(1);
  });

  it('returns empty list when envelope is stale', async () => {
    localStorage.setItem(
      'unlinkd.identifiers.v1',
      JSON.stringify({
        salt: 'YWFhYWFhYWFhYWFhYWFhYQ==',
        iv: 'YmJiYmJiYmJiYmJi',
        ciphertext: 'YmFk'
      })
    );

    const loaded = await loadIdentifiers(30, 'passphrase');
    expect(loaded).toBeNull();
  });

  it('returns null for wrong decryption key', async () => {
    await saveIdentifiers([{ id: '1', type: 'email', value: 'a@a.com', sensitivity: 2, consent: true }], 'passphrase');

    const loaded = await loadIdentifiers(90, 'wrong');
    expect(loaded).toBeNull();
  });
});
