import { describe, expect, it } from 'vitest';
import { encryptBytes, needsKdfUpgrade, setScryptParamsForTesting } from './crypto';
import { getEvidencePayload, putEvidencePayload } from './evidence';
import { countLegacyEvidence, upgradeLegacyEvidence } from './maintenance';

const PASSPHRASE = 'test-passphrase-123';

/** A pre-scrypt (PBKDF2 v1) envelope, written the way older builds did. */
async function legacyEnvelope(data: Uint8Array, passphrase: string): Promise<unknown> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 1000;

  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), { name: 'PBKDF2' }, false, [
    'deriveKey'
  ]);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, data);

  const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
  return {
    version: 1,
    kdf: 'pbkdf2-sha256',
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext))
  };
}

describe('evidence KDF upgrade', () => {
  it('counts only payloads written with a pre-scrypt envelope', async () => {
    setScryptParamsForTesting({ N: 2 ** 8, r: 8, p: 1 });

    await putEvidencePayload('legacy-1', (await legacyEnvelope(new Uint8Array([1, 2, 3]), PASSPHRASE)) as never);
    await putEvidencePayload('modern-1', await encryptBytes(new Uint8Array([4, 5, 6]), PASSPHRASE));

    expect(await countLegacyEvidence()).toBe(1);
  });

  it('re-encrypts legacy payloads under scrypt while preserving the plaintext', async () => {
    const plaintext = new Uint8Array([9, 8, 7, 6]);
    await putEvidencePayload('legacy-1', (await legacyEnvelope(plaintext, PASSPHRASE)) as never);

    const result = await upgradeLegacyEvidence(PASSPHRASE);

    expect(result).toEqual({ upgraded: 1, failed: 0 });
    const stored = await getEvidencePayload('legacy-1');
    expect(needsKdfUpgrade(stored)).toBe(false);
    expect(await countLegacyEvidence()).toBe(0);
  });

  it('leaves payloads it cannot decrypt untouched instead of destroying them', async () => {
    const original = (await legacyEnvelope(new Uint8Array([1]), 'a-different-passphrase')) as never;
    await putEvidencePayload('legacy-1', original);

    const result = await upgradeLegacyEvidence(PASSPHRASE);

    expect(result).toEqual({ upgraded: 0, failed: 1 });
    expect(await getEvidencePayload('legacy-1')).toEqual(original);
  });
});
