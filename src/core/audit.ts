import { decryptJson, encryptJson } from './crypto';

export type AuditAction = 'identifier_added' | 'identifier_rejected';

export interface AuditRecord {
  id: string;
  action: AuditAction;
  details: string;
  timestamp: string;
  previousHash: string | null;
  hash: string;
}

const auditStorageKey = 'unlinkd.audit.v1';
const textEncoder = new TextEncoder();

interface AuditEnvelope {
  version: 1;
  records: AuditRecord[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function isAuditAction(value: unknown): value is AuditAction {
  return value === 'identifier_added' || value === 'identifier_rejected';
}

function isAuditRecord(value: unknown): value is AuditRecord {
  if (!isRecord(value)) {
    return false;
  }

  const previousHashOk = value.previousHash === null || typeof value.previousHash === 'string';
  return (
    typeof value.id === 'string' &&
    isAuditAction(value.action) &&
    typeof value.details === 'string' &&
    typeof value.timestamp === 'string' &&
    previousHashOk &&
    typeof value.hash === 'string'
  );
}

function isAuditRecordArray(value: unknown): value is AuditRecord[] {
  return Array.isArray(value) && value.every(isAuditRecord);
}

function isAuditEnvelope(value: unknown): value is AuditEnvelope {
  if (!isRecord(value)) {
    return false;
  }

  return value.version === 1 && isAuditRecordArray(value.records);
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(input));
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

async function readAuditEnvelope(passphrase: string): Promise<AuditEnvelope | null> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(auditStorageKey);
  } catch {
    return null;
  }

  if (!raw) {
    return { version: 1, records: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  // Legacy storage: plaintext array of records. Migrate to encrypted on first successful unlock.
  if (Array.isArray(parsed)) {
    if (!isAuditRecordArray(parsed)) {
      return null;
    }

    const envelope: AuditEnvelope = { version: 1, records: parsed };
    const encrypted = await encryptJson(envelope, passphrase);
    try {
      localStorage.setItem(auditStorageKey, JSON.stringify(encrypted));
    } catch {
      // If we can't persist the migration, still allow reading in-memory.
    }

    return envelope;
  }

  const decrypted = await decryptJson(parsed, passphrase);
  if (decrypted === null) {
    return null;
  }

  return isAuditEnvelope(decrypted) ? decrypted : null;
}

async function writeAuditEnvelope(envelope: AuditEnvelope, passphrase: string): Promise<boolean> {
  const encrypted = await encryptJson(envelope, passphrase);
  try {
    localStorage.setItem(auditStorageKey, JSON.stringify(encrypted));
    return true;
  } catch {
    return false;
  }
}

export async function loadAuditRecords(passphrase: string): Promise<AuditRecord[] | null> {
  const envelope = await readAuditEnvelope(passphrase);
  return envelope ? envelope.records : null;
}

export async function appendAuditRecord(
  action: AuditAction,
  details: string,
  passphrase: string
): Promise<AuditRecord | null> {
  const envelope = await readAuditEnvelope(passphrase);
  if (!envelope) {
    return null;
  }

  const previousHash =
    envelope.records.length > 0 ? envelope.records[envelope.records.length - 1]?.hash ?? null : null;
  const timestamp = new Date().toISOString();
  const id = crypto.randomUUID();
  const hash = await sha256Hex(`${id}:${action}:${details}:${timestamp}:${previousHash ?? 'root'}`);

  const record: AuditRecord = {
    id,
    action,
    details,
    timestamp,
    previousHash,
    hash
  };

  const next: AuditEnvelope = { version: 1, records: [...envelope.records, record] };
  const ok = await writeAuditEnvelope(next, passphrase);
  return ok ? record : null;
}

export async function verifyAuditChain(passphrase: string): Promise<boolean> {
  const records = await loadAuditRecords(passphrase);
  if (!records) {
    return false;
  }

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) {
      return false;
    }

    const expectedPreviousHash = index === 0 ? null : records[index - 1]?.hash ?? null;
    if (record.previousHash !== expectedPreviousHash) {
      return false;
    }

    const expectedHash = await sha256Hex(
      `${record.id}:${record.action}:${record.details}:${record.timestamp}:${record.previousHash ?? 'root'}`
    );

    if (record.hash !== expectedHash) {
      return false;
    }
  }

  return true;
}

