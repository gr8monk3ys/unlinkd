import { clearAuditCiphertext, getRawAuditCiphertext, setRawAuditCiphertext } from './audit';
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
  for (const row of file.evidence) {
    if (!isRecord(row) || typeof row.id !== 'string') {
      throw new Error('Invalid backup file: each evidence entry must have a string id.');
    }
  }
}

export async function importBackup(file: unknown): Promise<void> {
  validateBackupStructure(file);

  await clearEvidenceStore();
  clearVaultCiphertext();
  clearAuditCiphertext();

  if (file.vaultCiphertext) {
    setRawVaultCiphertext(file.vaultCiphertext);
  }

  if (file.auditCiphertext) {
    setRawAuditCiphertext(file.auditCiphertext);
  }

  for (const row of file.evidence) {
    await putEvidencePayload(row.id, row.payload as never);
  }
}

export async function wipeAllData(): Promise<void> {
  await clearEvidenceStore();
  clearVaultCiphertext();
  clearAuditCiphertext();
}
