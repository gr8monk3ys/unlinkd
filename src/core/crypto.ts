const encoder = new TextEncoder();
const decoder = new TextDecoder();


function asBufferSource(value: Uint8Array): BufferSource {
  return value as unknown as BufferSource;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const merged = new Uint8Array(a.length + b.length);
  merged.set(a, 0);
  merged.set(b, a.length);
  return merged;
}

async function deriveAesKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = concatBytes(encoder.encode(passphrase), salt);
  const digest = await crypto.subtle.digest('SHA-256', asBufferSource(material));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function toBase64(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value));
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export interface EncryptedPayload {
  salt: string;
  iv: string;
  ciphertext: string;
}

export async function encryptJson(payload: unknown, passphrase: string): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: asBufferSource(iv) }, key, asBufferSource(encoder.encode(JSON.stringify(payload))));

  return {
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext))
  };
}

export async function decryptJson(payload: EncryptedPayload, passphrase: string): Promise<unknown | null> {
  try {
    const salt = fromBase64(payload.salt);
    const iv = fromBase64(payload.iv);
    const data = fromBase64(payload.ciphertext);
    const key = await deriveAesKey(passphrase, salt);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: asBufferSource(iv) }, key, asBufferSource(data));
    return JSON.parse(decoder.decode(plaintext));
  } catch {
    return null;
  }
}
