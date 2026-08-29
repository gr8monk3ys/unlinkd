import { scryptAsync } from '@noble/hashes/scrypt.js';
import { fromBase64, isRecord } from './utils';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// PBKDF2 derivation is retained only to read pre-existing v1 envelopes; the
// per-envelope iteration count is taken from the stored payload. New data is
// written with memory-hard scrypt (see below).
const BASE64_CHUNK_SIZE = 0x8000;

export interface ScryptParams {
  /** CPU/memory cost; must be a power of two. */
  N: number;
  /** Block size. */
  r: number;
  /** Parallelization. */
  p: number;
}

// Memory-hard default for new envelopes. N=2^15 with r=8 uses ~32 MiB, which is
// GPU/ASIC-resistant in a way PBKDF2 is not, while staying responsive in-browser.
export const DEFAULT_SCRYPT_PARAMS: Readonly<ScryptParams> = { N: 2 ** 15, r: 8, p: 1 };

let activeScryptParams: ScryptParams = { ...DEFAULT_SCRYPT_PARAMS };

/**
 * Test-only seam: lowers the scrypt work factor so the suite stays fast. Never
 * call this in production code — it weakens key derivation by design.
 */
export function setScryptParamsForTesting(params: ScryptParams): void {
  activeScryptParams = { ...params };
}

function asBufferSource(value: Uint8Array): BufferSource {
  return value as unknown as BufferSource;
}

/**
 * Encode a passphrase for key derivation. Unicode-normalized (NFC) so the same
 * visual passphrase typed on different OSes/IMEs (composed vs decomposed
 * accents) always derives the same key.
 */
export function passphraseBytes(passphrase: string): Uint8Array {
  return encoder.encode(passphrase.normalize('NFC'));
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const merged = new Uint8Array(a.length + b.length);
  merged.set(a, 0);
  merged.set(b, a.length);
  return merged;
}

async function deriveAesKeyScrypt(passphrase: string, salt: Uint8Array, params: ScryptParams): Promise<CryptoKey> {
  const keyBytes = await scryptAsync(passphraseBytes(passphrase), salt, {
    N: params.N,
    r: params.r,
    p: params.p,
    dkLen: 32
  });

  return crypto.subtle.importKey('raw', asBufferSource(keyBytes), { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt'
  ]);
}

async function deriveAesKeyPbkdf2(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    asBufferSource(passphraseBytes(passphrase)),
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
  const material = concatBytes(passphraseBytes(passphrase), salt);
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

export interface EncryptedPayloadV2 {
  version: 2;
  kdf: 'scrypt';
  n: number;
  r: number;
  p: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

export type EncryptedPayload = EncryptedPayloadLegacy | EncryptedPayloadV1 | EncryptedPayloadV2;

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

// Upper bounds for KDF cost parameters read from stored/imported envelopes.
// Envelopes are untrusted input (a hostile backup file or storage write), so an
// absurd cost must be rejected up front instead of pegging the tab for hours.
const MAX_SCRYPT_N = 2 ** 22;
const MAX_SCRYPT_R = 64;
const MAX_SCRYPT_P = 16;
const MAX_PBKDF2_ITERATIONS = 10_000_000;

function isPowerOfTwo(value: number): boolean {
  return (value & (value - 1)) === 0;
}

function isSaneScryptCost(n: number, r: number, p: number): boolean {
  return n >= 2 && n <= MAX_SCRYPT_N && isPowerOfTwo(n) && r <= MAX_SCRYPT_R && p <= MAX_SCRYPT_P;
}

interface EnvelopeBase {
  salt: string;
  iv: string;
  ciphertext: string;
}

function parseV2Payload(value: Record<string, unknown>, base: EnvelopeBase): EncryptedPayloadV2 | null {
  if (value.kdf !== 'scrypt' || !isPositiveInt(value.n) || !isPositiveInt(value.r) || !isPositiveInt(value.p)) {
    return null;
  }

  if (!isSaneScryptCost(value.n, value.r, value.p)) {
    return null;
  }

  return { version: 2, kdf: 'scrypt', n: value.n, r: value.r, p: value.p, ...base };
}

function parseV1Payload(value: Record<string, unknown>, base: EnvelopeBase): EncryptedPayloadV1 | null {
  const iterations = typeof value.iterations === 'number' ? value.iterations : null;
  const kdf = value.kdf === 'pbkdf2-sha256' ? value.kdf : null;
  if (!iterations || iterations <= 0 || !Number.isFinite(iterations) || iterations > MAX_PBKDF2_ITERATIONS || !kdf) {
    return null;
  }

  return { version: 1, kdf, iterations, ...base };
}

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

  const base: EnvelopeBase = { salt, iv, ciphertext };
  if (value.version === 2) {
    return parseV2Payload(value, base);
  }

  if (value.version === 1) {
    return parseV1Payload(value, base);
  }

  return base;
}

/**
 * Returns true if `value` has the shape of one of our encrypted envelopes.
 * Used by backup import to reject non-ciphertext blobs before persisting them.
 */
export function isEncryptedPayload(value: unknown): boolean {
  return parseEncryptedPayload(value) !== null;
}

/**
 * Returns true if `value` is a readable envelope written with a pre-scrypt KDF
 * (unversioned SHA-256 or v1 PBKDF2). Callers use this to proactively
 * re-encrypt data under the current memory-hard KDF after a successful unlock.
 */
export function needsKdfUpgrade(value: unknown): boolean {
  const parsed = parseEncryptedPayload(value);
  return parsed !== null && !('version' in parsed && parsed.version === 2);
}

async function deriveKeyForPayload(payload: EncryptedPayload, passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  if ('version' in payload && payload.version === 2) {
    return deriveAesKeyScrypt(passphrase, salt, { N: payload.n, r: payload.r, p: payload.p });
  }
  if ('version' in payload && payload.version === 1) {
    return deriveAesKeyPbkdf2(passphrase, salt, payload.iterations);
  }
  return deriveAesKeyLegacy(passphrase, salt);
}

async function encryptRaw(data: Uint8Array, passphrase: string): Promise<EncryptedPayloadV2> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const params = activeScryptParams;
  const key = await deriveAesKeyScrypt(passphrase, salt, params);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: asBufferSource(iv), tagLength: 128 },
    key,
    asBufferSource(data)
  );

  return {
    version: 2,
    kdf: 'scrypt',
    n: params.N,
    r: params.r,
    p: params.p,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext))
  };
}

export async function encryptJson(payload: unknown, passphrase: string): Promise<EncryptedPayloadV2> {
  return encryptRaw(encoder.encode(JSON.stringify(payload)), passphrase);
}

export async function encryptBytes(payload: Uint8Array, passphrase: string): Promise<EncryptedPayloadV2> {
  return encryptRaw(payload, passphrase);
}

async function decryptRaw(payload: unknown, passphrase: string): Promise<Uint8Array | null> {
  const parsed = parseEncryptedPayload(payload);
  if (!parsed) {
    return null;
  }

  const salt = fromBase64(parsed.salt);
  const iv = fromBase64(parsed.iv);
  const data = fromBase64(parsed.ciphertext);
  const key = await deriveKeyForPayload(parsed, passphrase, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: asBufferSource(iv), tagLength: 128 },
    key,
    asBufferSource(data)
  );
  return new Uint8Array(plaintext);
}

export async function decryptJson(payload: unknown, passphrase: string): Promise<unknown | null> {
  try {
    const plaintext = await decryptRaw(payload, passphrase);
    if (!plaintext) {
      return null;
    }
    return JSON.parse(decoder.decode(plaintext));
  } catch {
    return null;
  }
}

export async function decryptBytes(payload: unknown, passphrase: string): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const plaintext = await decryptRaw(payload, passphrase);
    return plaintext ? (new Uint8Array(plaintext) as Uint8Array<ArrayBuffer>) : null;
  } catch {
    return null;
  }
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
