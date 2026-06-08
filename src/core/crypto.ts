const encoder = new TextEncoder();
const decoder = new TextDecoder();

const DEFAULT_PBKDF2_ITERATIONS = 310_000;
const BASE64_CHUNK_SIZE = 0x8000;

function asBufferSource(value: Uint8Array): BufferSource {
  return value as unknown as BufferSource;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const merged = new Uint8Array(a.length + b.length);
  merged.set(a, 0);
  merged.set(b, a.length);
  return merged;
}

async function deriveAesKeyPbkdf2(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    asBufferSource(encoder.encode(passphrase)),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: asBufferSource(salt), iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function deriveAesKeyLegacy(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = concatBytes(encoder.encode(passphrase), salt);
  const digest = await crypto.subtle.digest('SHA-256', asBufferSource(material));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function toBase64(value: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < value.length; index += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...value.subarray(index, index + BASE64_CHUNK_SIZE));
  }

  return btoa(binary);
}

import { fromBase64, isRecord } from './utils';


interface EncryptedPayloadLegacy {
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface EncryptedPayloadV1 {
  version: 1;
  kdf: 'pbkdf2-sha256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

export type EncryptedPayload = EncryptedPayloadLegacy | EncryptedPayloadV1;

function parseEncryptedPayload(value: unknown): EncryptedPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const salt = typeof value.salt === 'string' ? value.salt : null;
  const iv = typeof value.iv === 'string' ? value.iv : null;
  const ciphertext = typeof value.ciphertext === 'string' ? value.ciphertext : null;
  if (!salt || !iv || !ciphertext) {
    return null;
  }

  if (value.version === 1) {
    const iterations = typeof value.iterations === 'number' ? value.iterations : null;
    const kdf = value.kdf === 'pbkdf2-sha256' ? value.kdf : null;
    if (!iterations || iterations <= 0 || !Number.isFinite(iterations) || !kdf) {
      return null;
    }

    return {
      version: 1,
      kdf,
      iterations,
      salt,
      iv,
      ciphertext
    };
  }

  return { salt, iv, ciphertext };
}

export async function encryptJson(payload: unknown, passphrase: string): Promise<EncryptedPayloadV1> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = DEFAULT_PBKDF2_ITERATIONS;
  const key = await deriveAesKeyPbkdf2(passphrase, salt, iterations);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: asBufferSource(iv), tagLength: 128 },
    key,
    asBufferSource(encoder.encode(JSON.stringify(payload)))
  );

  return {
    version: 1,
    kdf: 'pbkdf2-sha256',
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext))
  };
}

export async function decryptJson(payload: unknown, passphrase: string): Promise<unknown | null> {
  try {
    const parsed = parseEncryptedPayload(payload);
    if (!parsed) {
      return null;
    }

    const salt = fromBase64(parsed.salt);
    const iv = fromBase64(parsed.iv);
    const data = fromBase64(parsed.ciphertext);
    const key =
      'version' in parsed
        ? await deriveAesKeyPbkdf2(passphrase, salt, parsed.iterations)
        : await deriveAesKeyLegacy(passphrase, salt);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: asBufferSource(iv), tagLength: 128 },
      key,
      asBufferSource(data)
    );
    return JSON.parse(decoder.decode(plaintext));
  } catch {
    return null;
  }
}

export async function encryptBytes(payload: Uint8Array, passphrase: string): Promise<EncryptedPayloadV1> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = DEFAULT_PBKDF2_ITERATIONS;
  const key = await deriveAesKeyPbkdf2(passphrase, salt, iterations);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: asBufferSource(iv), tagLength: 128 }, key, asBufferSource(payload));

  return {
    version: 1,
    kdf: 'pbkdf2-sha256',
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext))
  };
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * SHA-1 hex digest. Used only for the HIBP Pwned Passwords k-anonymity range
 * API, which is defined in terms of SHA-1. Not used for any security boundary.
 */
export async function sha1Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256HexBytes(value: Uint8Array): Promise<string> {
  const stable: Uint8Array<ArrayBuffer> =
    value.buffer instanceof ArrayBuffer ? (value as Uint8Array<ArrayBuffer>) : new Uint8Array(value);
  const digest = await crypto.subtle.digest('SHA-256', stable);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function decryptBytes(payload: unknown, passphrase: string): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const parsed = parseEncryptedPayload(payload);
    if (!parsed) {
      return null;
    }

    const salt = fromBase64(parsed.salt);
    const iv = fromBase64(parsed.iv);
    const data = fromBase64(parsed.ciphertext);
    const key =
      'version' in parsed
        ? await deriveAesKeyPbkdf2(passphrase, salt, parsed.iterations)
        : await deriveAesKeyLegacy(passphrase, salt);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: asBufferSource(iv), tagLength: 128 },
      key,
      asBufferSource(data)
    );
    return new Uint8Array(plaintext);
  } catch {
    return null;
  }
}
