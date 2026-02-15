import { createHash } from 'node:crypto';

const encoder = new TextEncoder();
const DEFAULT_PBKDF2_ITERATIONS = 310_000;

function toBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

export function sha256HexBytes(bytes) {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

async function deriveAesKeyPbkdf2(passphrase, salt, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptBytes(bytes, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = DEFAULT_PBKDF2_ITERATIONS;
  const key = await deriveAesKeyPbkdf2(passphrase, salt, iterations);

  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);

  return {
    version: 1,
    kdf: 'pbkdf2-sha256',
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext))
  };
}

