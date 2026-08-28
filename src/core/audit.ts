import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { decryptJson, encryptJson, passphraseBytes } from './crypto';
import { isRecord } from './utils';

export const auditActions = [
  'identifier_added',
  'identifier_rejected',
  'persona_created',
  'account_added',
  'account_imported',
  'connector_added',
  'connector_catalog_updated',
  'connector_state_changed',
  'connector_rechecked',
  'request_sent',
  'request_response_recorded',
  'request_closed',
  'evidence_added',
  'evidence_deleted',
  'agent_job_exported',
  'agent_results_imported',
  'scan_ran',
  'finding_status_changed',
  'settings_updated',
  'vault_exported',
  'vault_imported'
] as const;

export type AuditAction = (typeof auditActions)[number];

export interface AuditRecord {
  id: string;
  action: AuditAction;
  details: string;
  timestamp: string;
  previousHash: string | null;
  hash: string;
}

const auditStorageKey = 'unlinkd.audit.v1';
const encoder = new TextEncoder();

// Domain-separated salt/info for the audit MAC key. The key is derived from the
// vault passphrase, so an attacker who can write local storage but does NOT know
// the passphrase cannot recompute a valid chain (the old unkeyed SHA-256 chain
// could be rewritten by anyone). A holder of the passphrase can still forge it —
// that is unavoidable for a purely local tool with no external notary.
const AUDIT_MAC_SALT = encoder.encode('unlinkd.audit.mac.salt.v1');
const AUDIT_MAC_INFO = encoder.encode('unlinkd.audit.hmac-chain.v1');

interface AuditEnvelope {
  version: 1;
  records: AuditRecord[];
}

function deriveAuditMacKey(passphrase: string): Uint8Array {
  // NFC-normalized (see passphraseBytes) so the MAC key matches the vault key
  // derivation for the same visual passphrase across OS/IME encodings.
  return hkdf(sha256, passphraseBytes(passphrase), AUDIT_MAC_SALT, AUDIT_MAC_INFO, 32);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function computeRecordMac(
  macKey: Uint8Array,
  parts: { id: string; action: string; details: string; timestamp: string; previousHash: string | null }
): string {
  const message = encoder.encode(
    `${parts.id}:${parts.action}:${parts.details}:${parts.timestamp}:${parts.previousHash ?? 'root'}`
  );
  return toHex(hmac(sha256, macKey, message));
}

function isAuditAction(value: unknown): value is AuditAction {
  return typeof value === 'string' && (auditActions as readonly string[]).includes(value);
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

function readRawAudit(): string | null {
  try {
    return localStorage.getItem(auditStorageKey);
  } catch {
    return null;
  }
}

async function readAuditEnvelope(passphrase: string): Promise<AuditEnvelope | null> {
  const raw = readRawAudit();

  if (!raw) {
    return { version: 1, records: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  // The audit log is only ever persisted as an encrypted envelope. We do NOT
  // accept a bare plaintext array: that legacy "migration" path let an attacker
  // who can write local storage inject a fully-forged log without the
  // passphrase. A bare array is treated as no usable log (start fresh).
  if (Array.isArray(parsed)) {
    return { version: 1, records: [] };
  }

  const decrypted = await decryptJson(parsed, passphrase);
  if (decrypted === null) {
    return null;
  }

  return isAuditEnvelope(decrypted) ? decrypted : null;
}

/** How many times an append re-reads and rebuilds after losing a cross-tab race. */
const APPEND_MAX_ATTEMPTS = 3;

export async function loadAuditRecords(passphrase: string): Promise<AuditRecord[] | null> {
  const envelope = await readAuditEnvelope(passphrase);
  return envelope ? envelope.records : null;
}

export async function appendAuditRecord(
  action: AuditAction,
  details: string,
  passphrase: string
): Promise<AuditRecord | null> {
  // The log is an append-only chain stored as one blob, so a concurrent append
  // in another tab would otherwise be silently dropped (and the shortened chain
  // would still verify). Detect the race and rebuild the record on top of the
  // winner's chain instead of clobbering it.
  for (let attempt = 0; attempt < APPEND_MAX_ATTEMPTS; attempt += 1) {
    const rawBefore = readRawAudit();
    const envelope = await readAuditEnvelope(passphrase);
    if (!envelope) {
      return null;
    }

    const previousHash =
      envelope.records.length > 0 ? envelope.records[envelope.records.length - 1]?.hash ?? null : null;
    const timestamp = new Date().toISOString();
    const id = crypto.randomUUID();
    const macKey = deriveAuditMacKey(passphrase);
    const hash = computeRecordMac(macKey, { id, action, details, timestamp, previousHash });

    const record: AuditRecord = {
      id,
      action,
      details,
      timestamp,
      previousHash,
      hash
    };

    const next: AuditEnvelope = { version: 1, records: [...envelope.records, record] };
    // Encrypt BEFORE the conflict check so the compare and the write are
    // adjacent and synchronous — no await can interleave between them.
    const encrypted = await encryptJson(next, passphrase);

    if (readRawAudit() !== rawBefore) {
      continue; // Another tab appended; rebuild on top of its chain.
    }

    try {
      localStorage.setItem(auditStorageKey, JSON.stringify(encrypted));
    } catch {
      return null;
    }
    return record;
  }

  return null;
}

export async function verifyAuditChain(passphrase: string): Promise<boolean> {
  const records = await loadAuditRecords(passphrase);
  if (!records) {
    return false;
  }

  const macKey = deriveAuditMacKey(passphrase);

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) {
      return false;
    }

    const expectedPreviousHash = index === 0 ? null : records[index - 1]?.hash ?? null;
    if (record.previousHash !== expectedPreviousHash) {
      return false;
    }

    const expectedHash = computeRecordMac(macKey, {
      id: record.id,
      action: record.action,
      details: record.details,
      timestamp: record.timestamp,
      previousHash: record.previousHash
    });

    if (record.hash !== expectedHash) {
      return false;
    }
  }

  return true;
}

export function getAuditStorageKey(): string {
  return auditStorageKey;
}

export function getRawAuditCiphertext(): string | null {
  try {
    return localStorage.getItem(auditStorageKey);
  } catch {
    return null;
  }
}

export function setRawAuditCiphertext(value: string): void {
  // Used for backup restore.
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Invalid audit payload.');
  }

  if (!isRecord(parsed)) {
    throw new Error('Invalid audit payload.');
  }

  try {
    localStorage.setItem(auditStorageKey, value);
  } catch {
    throw new Error('Unable to persist audit log.');
  }
}

export function clearAuditCiphertext(): void {
  try {
    localStorage.removeItem(auditStorageKey);
  } catch {
    // ignore
  }
}
