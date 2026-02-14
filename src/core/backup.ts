import { clearAuditCiphertext, getRawAuditCiphertext, setRawAuditCiphertext } from './audit';
import { clearEvidenceStore, listEvidencePayloads, putEvidencePayload } from './evidence';
import { clearVaultCiphertext, getRawVaultCiphertext, setRawVaultCiphertext } from './vault';

export interface BackupFileV1 {
  version: 1;
  exportedAt: string;
  vaultCiphertext: string | null;
  auditCiphertext: string | null;
  evidence: Array<{ id: string; payload: unknown }>;
}

function nowIso(): string {
  return new Date().toISOString();
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

export async function importBackup(file: BackupFileV1): Promise<void> {
  if (file.version !== 1) {
    throw new Error('Unsupported backup format.');
  }

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
