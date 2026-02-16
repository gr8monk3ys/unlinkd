import { z } from 'zod';
import { decryptJson, encryptJson } from './crypto';
import type { Account, ConnectorInstance, Identifier, Persona, RiskFinding } from './types';

const vaultStorageKey = 'unlinkd.vault.v1';

export interface VaultStateV1 {
  version: 1;
  savedAt: string;
  activePersonaId: string;
  personas: Persona[];
  identifiers: Identifier[];
  accounts: Account[];
  connectorInstances: ConnectorInstance[];
  findings: RiskFinding[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

const personaSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  notes: z.string().optional(),
  createdAt: z.string()
});

const identifierSchema = z.object({
  id: z.string(),
  personaId: z.string().optional(),
  type: z.enum(['legal_name', 'email', 'phone', 'username', 'address', 'device']),
  value: z.string(),
  sensitivity: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  consent: z.boolean(),
  createdAt: z.string().optional()
});

const accountSchema = z.object({
  id: z.string(),
  personaId: z.string(),
  service: z.string(),
  username: z.string(),
  url: z.string().optional(),
  lastSeenAt: z.string().optional(),
  mfaEnabled: z.boolean().optional(),
  status: z.enum(['active', 'unused', 'removed', 'unknown']),
  createdAt: z.string()
});

const evidenceMetaSchema = z.object({
  id: z.string(),
  connectorInstanceId: z.string(),
  kind: z.enum(['screenshot', 'pdf', 'email', 'note', 'file']),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number(),
  sha256: z.string(),
  createdAt: z.string(),
  label: z.string().optional()
});

const connectorInstanceSchema = z.object({
  id: z.string(),
  connectorId: z.string(),
  personaId: z.string(),
  state: z.enum(['discovered', 'verified', 'user_approved', 'executed', 'proof_captured', 'recheck_scheduled']),
  createdAt: z.string(),
  updatedAt: z.string(),
  nextCheckAt: z.string().optional(),
  evidence: z.array(evidenceMetaSchema),
  notes: z.string().optional()
});

const findingSchema = z.object({
  id: z.string(),
  title: z.string(),
  harm: z.number(),
  exploitability: z.number(),
  tier: z.enum(['low', 'moderate', 'high']),
  personaId: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'mitigated']).optional(),
  source: z.enum(['local', 'import', 'agent']).optional(),
  createdAt: z.string().optional(),
  connectorInstanceId: z.string().optional()
});

const vaultSchemaV1 = z.object({
  version: z.literal(1),
  savedAt: z.string(),
  activePersonaId: z.string(),
  personas: z.array(personaSchema),
  identifiers: z.array(identifierSchema),
  accounts: z.array(accountSchema),
  connectorInstances: z.array(connectorInstanceSchema),
  findings: z.array(findingSchema)
});

export function createEmptyVault(): VaultStateV1 {
  const defaultPersona: Persona = {
    id: crypto.randomUUID(),
    name: 'Default',
    createdAt: nowIso()
  };

  return {
    version: 1,
    savedAt: nowIso(),
    activePersonaId: defaultPersona.id,
    personas: [defaultPersona],
    identifiers: [],
    accounts: [],
    connectorInstances: [],
    findings: []
  };
}

function normalizeVault(value: VaultStateV1): VaultStateV1 {
  let personas = value.personas;
  if (personas.length === 0) {
    const defaultPersona: Persona = { id: crypto.randomUUID(), name: 'Default', createdAt: nowIso() };
    personas = [defaultPersona];
  }

  const personaIds = new Set(personas.map((persona) => persona.id));
  const activePersonaId = personaIds.has(value.activePersonaId) ? value.activePersonaId : personas[0]!.id;

  const identifiers: Identifier[] = value.identifiers.map((identifier) => ({
    ...identifier,
    personaId: identifier.personaId && personaIds.has(identifier.personaId) ? identifier.personaId : activePersonaId,
    createdAt: identifier.createdAt ?? value.savedAt
  }));

  const accounts: Account[] = value.accounts.map((account) => ({
    ...account,
    personaId: personaIds.has(account.personaId) ? account.personaId : activePersonaId
  }));

  const connectorInstances: ConnectorInstance[] = value.connectorInstances.map((instance) => ({
    ...instance,
    personaId: personaIds.has(instance.personaId) ? instance.personaId : activePersonaId
  }));

  const findings: RiskFinding[] = value.findings.map((finding) => ({
    ...finding,
    createdAt: finding.createdAt ?? value.savedAt,
    status: finding.status ?? 'open',
    source: finding.source ?? 'local'
  }));

  return {
    ...value,
    activePersonaId,
    personas,
    identifiers,
    accounts,
    connectorInstances,
    findings
  };
}

function readRawVault(): string | null {
  try {
    return localStorage.getItem(vaultStorageKey);
  } catch {
    return null;
  }
}

function writeRawVault(value: string): void {
  try {
    localStorage.setItem(vaultStorageKey, value);
  } catch {
    throw new Error('Unable to persist vault.');
  }
}

export async function loadVault(passphrase: string): Promise<VaultStateV1 | null> {
  const raw = readRawVault();
  if (!raw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const decrypted = await decryptJson(parsed, passphrase);
  if (decrypted === null) {
    return null;
  }

  const validated = vaultSchemaV1.safeParse(decrypted);
  if (!validated.success) {
    return null;
  }

  const normalized = normalizeVault(validated.data);

  // Keep storage normalized after migrations.
  if (JSON.stringify(normalized) !== JSON.stringify(validated.data)) {
    await saveVault(normalized, passphrase);
  }

  return normalized;
}

export async function saveVault(state: VaultStateV1, passphrase: string): Promise<void> {
  const payload: VaultStateV1 = {
    ...state,
    savedAt: nowIso()
  };

  const encrypted = await encryptJson(payload, passphrase);
  writeRawVault(JSON.stringify(encrypted));
}

export async function unlockVault(passphrase: string): Promise<VaultStateV1 | null> {
  const existing = readRawVault();
  if (!existing) {
    const empty = createEmptyVault();
    await saveVault(empty, passphrase);
    return empty;
  }

  return loadVault(passphrase);
}

export function getVaultStorageKey(): string {
  return vaultStorageKey;
}

export function getRawVaultCiphertext(): string | null {
  return readRawVault();
}

export function setRawVaultCiphertext(value: string): void {
  // Used for backup restore.
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Invalid vault payload.');
  }

  if (!isRecord(parsed)) {
    throw new Error('Invalid vault payload.');
  }

  writeRawVault(value);
}

export function clearVaultCiphertext(): void {
  try {
    localStorage.removeItem(vaultStorageKey);
  } catch {
    // ignore
  }
}
