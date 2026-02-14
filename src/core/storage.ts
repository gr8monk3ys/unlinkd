import { decryptJson, encryptJson } from './crypto';
import type { Identifier } from './types';
import { isIdentifierArray } from './validation';

const storageKey = 'unlinkd.identifiers.v1';

interface IdentifierEnvelope {
  version: 1;
  savedAt: string;
  identifiers: Identifier[];
}

function isFresh(savedAt: string, retentionDays: number): boolean {
  const savedTimestamp = Date.parse(savedAt);
  if (!Number.isFinite(savedTimestamp)) {
    return false;
  }

  const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
  return Date.now() - savedTimestamp <= retentionMs;
}

function fromEnvelope(parsed: unknown, retentionDays: number): Identifier[] {
  if (!parsed || typeof parsed !== 'object') {
    return [];
  }

  const envelope = parsed as Partial<IdentifierEnvelope>;
  if (!envelope.savedAt || !isFresh(envelope.savedAt, retentionDays)) {
    return [];
  }

  return isIdentifierArray(envelope.identifiers) ? envelope.identifiers : [];
}

export async function loadIdentifiers(retentionDays: number, passphrase: string): Promise<Identifier[] | null> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(storageKey);
  } catch {
    return null;
  }

  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const decrypted = await decryptJson(parsed, passphrase);

    if (decrypted === null) {
      return null;
    }

    return fromEnvelope(decrypted, retentionDays);
  } catch {
    return null;
  }
}

export async function saveIdentifiers(identifiers: Identifier[], passphrase: string): Promise<void> {
  const payload: IdentifierEnvelope = {
    version: 1,
    savedAt: new Date().toISOString(),
    identifiers
  };

  const encryptedPayload = await encryptJson(payload, passphrase);
  try {
    localStorage.setItem(storageKey, JSON.stringify(encryptedPayload));
  } catch {
    throw new Error('Unable to persist identifiers.');
  }
}
