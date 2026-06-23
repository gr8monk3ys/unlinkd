import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCRYPT_PARAMS,
  decryptBytes,
  decryptJson,
  encryptBytes,
  encryptJson,
  isEncryptedPayload,
  sha256Hex,
  sha256HexBytes
} from './crypto';

describe('crypto', () => {
  describe('encryptJson / decryptJson', () => {
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

    it('returns null for non-object input', async () => {
      expect(await decryptJson(null, 'passphrase')).toBeNull();
      expect(await decryptJson('not-an-object', 'passphrase')).toBeNull();
      expect(await decryptJson(42, 'passphrase')).toBeNull();
    });

    it('returns null for malformed payload', async () => {
      const result = await decryptJson({ salt: 'x', iv: 'y' }, 'passphrase');
      expect(result).toBeNull();
    });

    it('produces v2 format with memory-hard scrypt metadata', async () => {
      const encrypted = await encryptJson('test', 'pass');

      expect(encrypted.version).toBe(2);
      expect(encrypted.kdf).toBe('scrypt');
      expect(typeof encrypted.n).toBe('number');
      expect(typeof encrypted.r).toBe('number');
      expect(typeof encrypted.p).toBe('number');
      expect(typeof encrypted.salt).toBe('string');
      expect(typeof encrypted.iv).toBe('string');
      expect(typeof encrypted.ciphertext).toBe('string');
    });

    it('uses a strong default scrypt work factor in production config', () => {
      // Guards against silently shipping a weak KDF. The test runner lowers the
      // active factor, but the production default constant must stay strong.
      expect(DEFAULT_SCRYPT_PARAMS.N).toBeGreaterThanOrEqual(2 ** 15);
      expect(DEFAULT_SCRYPT_PARAMS.r).toBeGreaterThanOrEqual(8);
    });

    it('returns null when the ciphertext is tampered with', async () => {
      const encrypted = await encryptJson({ hello: 'world' }, 'passphrase');
      // Flip a byte in the base64 ciphertext; AES-GCM auth must reject it.
      const bytes = atob(encrypted.ciphertext);
      const mutated = btoa((bytes[0] === 'A' ? 'B' : 'A') + bytes.slice(1));
      const decrypted = await decryptJson({ ...encrypted, ciphertext: mutated }, 'passphrase');

      expect(decrypted).toBeNull();
    });

    it('recognizes encrypted envelope shapes and rejects plain objects', async () => {
      const encrypted = await encryptJson({ a: 1 }, 'pass');
      expect(isEncryptedPayload(encrypted)).toBe(true);
      expect(isEncryptedPayload({ version: 1, kdf: 'pbkdf2-sha256', iterations: 1, salt: 'a', iv: 'b', ciphertext: 'c' })).toBe(
        true
      );
      expect(isEncryptedPayload({ salt: 'a', iv: 'b', ciphertext: 'c' })).toBe(true);
      expect(isEncryptedPayload({ hello: 'world' })).toBe(false);
      expect(isEncryptedPayload(null)).toBe(false);
      expect(isEncryptedPayload('nope')).toBe(false);
    });

    it('handles complex nested objects', async () => {
      const complex = { arr: [1, 2, 3], nested: { deep: true }, nullVal: null };
      const encrypted = await encryptJson(complex, 'p');
      const decrypted = await decryptJson(encrypted, 'p');

      expect(decrypted).toEqual(complex);
    });
  });

  describe('encryptBytes / decryptBytes', () => {
    it('encrypts and decrypts byte arrays', async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const encrypted = await encryptBytes(data, 'pass');
      const decrypted = await decryptBytes(encrypted, 'pass');

      expect(decrypted).toEqual(data);
    });

    it('returns null on wrong passphrase for bytes', async () => {
      const data = new Uint8Array([10, 20, 30]);
      const encrypted = await encryptBytes(data, 'pass');
      const decrypted = await decryptBytes(encrypted, 'wrong');

      expect(decrypted).toBeNull();
    });

    it('handles empty byte array', async () => {
      const data = new Uint8Array([]);
      const encrypted = await encryptBytes(data, 'pass');
      const decrypted = await decryptBytes(encrypted, 'pass');

      expect(decrypted).toEqual(data);
    });

    it('returns null for invalid input', async () => {
      expect(await decryptBytes(null, 'p')).toBeNull();
      expect(await decryptBytes({}, 'p')).toBeNull();
    });
  });

  describe('sha256Hex', () => {
    it('produces a 64-char hex string', async () => {
      const hash = await sha256Hex('hello');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces consistent output for same input', async () => {
      const a = await sha256Hex('test');
      const b = await sha256Hex('test');
      expect(a).toBe(b);
    });

    it('produces different output for different input', async () => {
      const a = await sha256Hex('one');
      const b = await sha256Hex('two');
      expect(a).not.toBe(b);
    });
  });

  describe('sha256HexBytes', () => {
    it('produces a 64-char hex string from bytes', async () => {
      const hash = await sha256HexBytes(new Uint8Array([1, 2, 3]));
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces consistent output', async () => {
      const data = new Uint8Array([10, 20, 30]);
      const a = await sha256HexBytes(data);
      const b = await sha256HexBytes(data);
      expect(a).toBe(b);
    });

    it('handles empty byte array', async () => {
      const hash = await sha256HexBytes(new Uint8Array([]));
      expect(hash).toHaveLength(64);
    });
  });
});
