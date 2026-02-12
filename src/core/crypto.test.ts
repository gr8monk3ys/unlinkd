import { describe, expect, it } from 'vitest';
import { decryptJson, encryptJson } from './crypto';

describe('crypto', () => {
  it('encrypts and decrypts json payload', async () => {
    const encrypted = await encryptJson({ hello: 'world' }, 'passphrase');
    const decrypted = await decryptJson(encrypted, 'passphrase');

    expect(decrypted).toEqual({ hello: 'world' });
  });

  it('returns null on wrong passphrase', async () => {
    const encrypted = await encryptJson({ hello: 'world' }, 'passphrase');
    const decrypted = await decryptJson(encrypted, 'wrong');

    expect(decrypted).toBeNull();
  });
});
