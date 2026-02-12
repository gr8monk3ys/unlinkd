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

function encoder(): TextEncoder {
  return new TextEncoder();
}

async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function rawAuditRecords(): AuditRecord[] {
  const raw = localStorage.getItem(auditStorageKey);
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AuditRecord[]) : [];
  } catch {
    return [];
  }
}

export function getAuditRecords(): AuditRecord[] {
  return rawAuditRecords();
}

export async function appendAuditRecord(action: AuditAction, details: string): Promise<AuditRecord> {
  const records = rawAuditRecords();
  const previousHash = records.length > 0 ? records[records.length - 1]?.hash ?? null : null;
  const timestamp = new Date().toISOString();
  const id = crypto.randomUUID();
  const hash = await sha256(`${id}:${action}:${details}:${timestamp}:${previousHash ?? 'root'}`);

  const record: AuditRecord = {
    id,
    action,
    details,
    timestamp,
    previousHash,
    hash
  };

  localStorage.setItem(auditStorageKey, JSON.stringify([...records, record]));
  return record;
}

export async function verifyAuditChain(): Promise<boolean> {
  const records = rawAuditRecords();

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) {
      return false;
    }

    const expectedPreviousHash = index === 0 ? null : records[index - 1]?.hash ?? null;
    if (record.previousHash !== expectedPreviousHash) {
      return false;
    }

    const expectedHash = await sha256(
      `${record.id}:${record.action}:${record.details}:${record.timestamp}:${record.previousHash ?? 'root'}`
    );

    if (record.hash !== expectedHash) {
      return false;
    }
  }

  return true;
}
