import { clearAuditCiphertext, getRawAuditCiphertext, setRawAuditCiphertext } from './audit';
import { decryptJson, isEncryptedPayload } from './crypto';
import { clearEvidenceStore, listEvidencePayloads, putEvidencePayload } from './evidence';
import { isRecord, nowIso } from './utils';
import { clearVaultCiphertext, getRawVaultCiphertext, setRawVaultCiphertext } from './vault';

export interface BackupFileV1 {
  version: 1;
  exportedAt: string;
  vaultCiphertext: string | null;
  auditCiphertext: string | null;
  evidence: Array<{ id: string; payload: unknown }>;
}

export async function exportBackup(): Promise<BackupFileV1> {
  const evidence = await listEvidencePayloads();

  return {
    version: 1,
    exportedAt: nowIso(),
    vaultCiphertext: getRawVaultCiphertext(),
    auditCiphertext: getRawAuditCiphertext(),
    evidence: evidence.map((row) => ({ id: row.id, payload: row.payload }))
  };
}

function parseCiphertextEnvelope(label: string, value: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`Invalid backup file: ${label} is not valid JSON.`);
  }
  if (!isEncryptedPayload(parsed)) {
    throw new Error(`Invalid backup file: ${label} is not an encrypted envelope.`);
  }
  return parsed;
}

function validateBackupStructure(file: unknown): asserts file is BackupFileV1 {
  if (!isRecord(file)) {
    throw new Error('Invalid backup file: not an object.');
  }
  if (file.version !== 1) {
    throw new Error('Unsupported backup format.');
  }
  if (file.vaultCiphertext !== null && typeof file.vaultCiphertext !== 'string') {
    throw new Error('Invalid backup file: vaultCiphertext must be a string or null.');
  }
  if (file.auditCiphertext !== null && typeof file.auditCiphertext !== 'string') {
    throw new Error('Invalid backup file: auditCiphertext must be a string or null.');
  }
  if (!Array.isArray(file.evidence)) {
    throw new Error('Invalid backup file: evidence must be an array.');
  }

  // Reject anything that is not a real encrypted envelope BEFORE we touch
  // storage, so a malformed/hostile file can never wipe the live vault.
  if (typeof file.vaultCiphertext === 'string') {
    parseCiphertextEnvelope('vaultCiphertext', file.vaultCiphertext);
  }
  if (typeof file.auditCiphertext === 'string') {
    parseCiphertextEnvelope('auditCiphertext', file.auditCiphertext);
  }
  for (const row of file.evidence) {
    if (!isRecord(row) || typeof row.id !== 'string') {
      throw new Error('Invalid backup file: each evidence entry must have a string id.');
    }
    if (!isEncryptedPayload(row.payload)) {
      throw new Error('Invalid backup file: each evidence payload must be an encrypted envelope.');
    }
  }
}

/**
 * Restore a backup. Safety properties:
 * - The file is fully validated as ciphertext envelopes BEFORE any write, so an
 *   invalid file cannot destroy existing data.
 * - When `expectedPassphrase` is supplied, the vault ciphertext must actually
 *   decrypt with it; otherwise import aborts (prevents locking yourself out by
 *   restoring a backup encrypted under a different passphrase).
 * - Vault/audit are snapshotted and rolled back if a write fails partway.
 */
export async function importBackup(file: unknown, expectedPassphrase?: string): Promise<void> {
  validateBackupStructure(file);

  if (expectedPassphrase !== undefined && file.vaultCiphertext) {
    const parsed = JSON.parse(file.vaultCiphertext) as unknown;
    const decrypted = await decryptJson(parsed, expectedPassphrase);
    if (decrypted === null) {
      throw new Error('Backup cannot be unlocked with the current passphrase. Import aborted; existing data is unchanged.');
    }
  }

  const prevVault = getRawVaultCiphertext();
  const prevAudit = getRawAuditCiphertext();

  try {
    if (file.vaultCiphertext) {
      setRawVaultCiphertext(file.vaultCiphertext);
    } else {
      clearVaultCiphertext();
    }

    if (file.auditCiphertext) {
      setRawAuditCiphertext(file.auditCiphertext);
    } else {
      clearAuditCiphertext();
    }

    await clearEvidenceStore();
    for (const row of file.evidence) {
      await putEvidencePayload(row.id, row.payload as never);
    }
  } catch (error) {
    // Roll back the critical vault/audit state on any write failure.
    if (prevVault !== null) {
      setRawVaultCiphertext(prevVault);
    } else {
      clearVaultCiphertext();
    }
    if (prevAudit !== null) {
      setRawAuditCiphertext(prevAudit);
    } else {
      clearAuditCiphertext();
    }
    throw error instanceof Error ? error : new Error('Backup import failed.');
  }
}

export async function wipeAllData(): Promise<void> {
  await clearEvidenceStore();
  clearVaultCiphertext();
  clearAuditCiphertext();
}
