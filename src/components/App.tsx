import { useEffect, useMemo, useRef, useState } from 'react';
import { appendAuditRecord, loadAuditRecords, verifyAuditChain } from '../core/audit';
import { createAgentJobV1, parseAgentResultsV1 } from '../core/agent';
import { exportBackup, importBackup, wipeAllData } from '../core/backup';
import { getAppConfig } from '../core/config';
import { decryptBytes, encryptBytes } from '../core/crypto';
import { deleteEvidencePayload, getEvidencePayload, putEvidencePayload } from '../core/evidence';
import { buildExposureGraph } from '../core/graph';
import { canAddIdentifier, findCrossPersonaDuplicate, hasDuplicateIdentifier } from '../core/policy';
import { sortFindingsByPriority } from '../core/scoring';
import { runLocalScan } from '../core/scans';
import type {
  Account,
  AccountStatus,
  ConnectorDefinition,
  ConnectorInstance,
  ConnectorState,
  EvidenceKind,
  EvidenceMeta,
  Identifier,
  IdentifierType,
  Persona,
  RiskFinding
} from '../core/types';
import { validateIdentifierInput } from '../core/validation';
import { canTransition, nextStates } from '../core/workflow';
import { createEmptyVault, saveVault, unlockVault } from '../core/vault';
import type { VaultStateV1 } from '../core/vault';
import {
  builtinConnectorCatalog,
  builtinConnectorCatalogVersion,
  getConnectorDefinition,
  mergeConnectorCatalogs
} from '../connectors/catalog';
import {
  fetchConnectorFeed,
  loadCachedConnectorFeed,
  parseConnectorCatalogFeedV1,
  parseConnectorDefinitions,
  saveCachedConnectorFeed
} from '../connectors/feed';
import { buildMarkdownReport } from '../core/report';
import { discoverAccountsFromMbox, parseAccountsCsv } from '../core/import/accounts';

type Tab = 'dashboard' | 'personas' | 'identifiers' | 'accounts' | 'connectors' | 'findings' | 'report' | 'backup';

const identifierTypes: IdentifierType[] = ['email', 'phone', 'username', 'address', 'legal_name', 'device'];
const accountStatuses: AccountStatus[] = ['active', 'unused', 'removed', 'unknown'];
const config = getAppConfig();

const connectorFeedUrl = import.meta.env.VITE_CONNECTOR_FEED_URL ?? '/connectors/catalog.v1.json';
const connectorFeedPublicKeyBase64 =
  import.meta.env.VITE_CONNECTOR_FEED_PUBKEY ?? 'UVJ6F12bTc60CZnoJUCHx+woHzUmAHNPPE0LXoE9xHw=';

function nowIso(): string {
  return new Date().toISOString();
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256HexBytes(value: Uint8Array): Promise<string> {
  // Some browser/DOM typings require ArrayBuffer-backed views for BufferSource.
  const stable: Uint8Array<ArrayBuffer> =
    value.buffer instanceof ArrayBuffer ? (value as Uint8Array<ArrayBuffer>) : new Uint8Array(value);
  const digest = await crypto.subtle.digest('SHA-256', stable);
  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('');
}

function addDaysIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Allow the browser to start the download before revoking the blob URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadJsonFile(filename: string, value: unknown): void {
  downloadTextFile(filename, JSON.stringify(value, null, 2));
}

function activePersona(vault: VaultStateV1): Persona {
  return vault.personas.find((persona) => persona.id === vault.activePersonaId) ?? vault.personas[0]!;
}

function connectorName(connectorId: string, catalog: ConnectorDefinition[]): string {
  return catalog.find((connector) => connector.id === connectorId)?.name ?? connectorId;
}

function dueConnectors(instances: ConnectorInstance[]): ConnectorInstance[] {
  const now = Date.now();
  return instances.filter((instance) => {
    if (!instance.nextCheckAt) {
      return false;
    }

    const ts = Date.parse(instance.nextCheckAt);
    return Number.isFinite(ts) && ts <= now;
  });
}

export function App(): React.JSX.Element {
  const busyRef = useRef(false);

  const [tab, setTab] = useState<Tab>('dashboard');

  const [passphrase, setPassphrase] = useState('');
  const [vault, setVault] = useState<VaultStateV1 | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditCount, setAuditCount] = useState<number>(0);
  const [connectorCatalog, setConnectorCatalog] = useState<ConnectorDefinition[]>(builtinConnectorCatalog);
  const [connectorCatalogMeta, setConnectorCatalogMeta] = useState<{
    source: 'builtin' | 'cache' | 'remote' | 'import';
    catalogVersion: string;
    generatedAt: string | null;
    verified: boolean | null;
    updatedAt: string | null;
    error: string | null;
  }>({
    source: 'builtin',
    catalogVersion: builtinConnectorCatalogVersion,
    generatedAt: null,
    verified: null,
    updatedAt: null,
    error: null
  });

  // Identifier form state
  const [idType, setIdType] = useState<IdentifierType>('email');
  const [idValue, setIdValue] = useState('');
  const [allowCrossPersonaReuse, setAllowCrossPersonaReuse] = useState(false);

  // Evidence upload state
  const [evidenceKind, setEvidenceKind] = useState<EvidenceKind>('file');
  const [evidenceLabel, setEvidenceLabel] = useState('');
  const [noteBody, setNoteBody] = useState('');

  // Account inventory state
  const [accountService, setAccountService] = useState('');
  const [accountUsername, setAccountUsername] = useState('');
  const [accountUrl, setAccountUrl] = useState('');
  const [accountStatus, setAccountStatus] = useState<AccountStatus>('active');
  const [accountsImportStatus, setAccountsImportStatus] = useState<string | null>(null);

  const persona = vault ? activePersona(vault) : null;
  const personaIdentifiers = useMemo(() => {
    if (!vault || !persona) {
      return [];
    }

    return vault.identifiers.filter((identifier) => (identifier.personaId ?? persona.id) === persona.id);
  }, [vault, persona]);

  const personaAccounts = useMemo(() => {
    if (!vault || !persona) {
      return [];
    }

    return vault.accounts.filter((account) => account.personaId === persona.id);
  }, [vault, persona]);

  const exposureGraph = useMemo(() => {
    if (!vault || !persona) {
      return { nodes: [], edges: [] };
    }

    return buildExposureGraph(personaIdentifiers);
  }, [vault, persona, personaIdentifiers]);

  const prioritizedFindings = useMemo(() => {
    if (!vault) {
      return [];
    }

    return sortFindingsByPriority(vault.findings);
  }, [vault]);

  useEffect(() => {
    const cached = loadCachedConnectorFeed();
    if (!cached) {
      return;
    }

    setConnectorCatalog(mergeConnectorCatalogs(builtinConnectorCatalog, cached.feed.connectors));
    setConnectorCatalogMeta({
      source: 'cache',
      catalogVersion: cached.feed.catalogVersion,
      generatedAt: cached.feed.generatedAt,
      verified: cached.verified,
      updatedAt: cached.cachedAt,
      error: null
    });
  }, []);

  async function withBusy<T>(fn: () => Promise<T>): Promise<T | null> {
    if (busyRef.current) {
      return null;
    }

    busyRef.current = true;
    try {
      return await fn();
    } finally {
      busyRef.current = false;
    }
  }

  async function persist(next: VaultStateV1): Promise<void> {
    if (!passphrase) {
      setError('Passphrase missing.');
      return;
    }

    try {
      await saveVault(next, passphrase);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to persist vault.';
      setError(message);
    }
  }

  async function handleUnlock(): Promise<void> {
    await withBusy(async () => {
      setError(null);
      setAuditError(null);

      if (!passphrase) {
        setError('Passphrase is required to unlock storage.');
        return;
      }

      const loaded = await unlockVault(passphrase);
      if (!loaded) {
        setError('Unable to unlock storage with the provided passphrase.');
        return;
      }

      setVault(loaded);
      setIsUnlocked(true);

      const auditRecords = await loadAuditRecords(passphrase);
      if (!auditRecords) {
        setAuditError('Unable to unlock audit log with the provided passphrase.');
        setAuditCount(0);
      } else {
        setAuditCount(auditRecords.length);
      }
    });
  }

  async function handleResetVault(): Promise<void> {
    await withBusy(async () => {
      if (!passphrase) {
        setError('Passphrase is required.');
        return;
      }

      const empty = createEmptyVault();
      await saveVault(empty, passphrase);
      setVault(empty);
      setIsUnlocked(true);
      setError(null);
    });
  }

  async function audit(action: Parameters<typeof appendAuditRecord>[0], details: string): Promise<void> {
    if (!passphrase) {
      return;
    }

    const record = await appendAuditRecord(action, details, passphrase);
    if (!record) {
      setAuditError('Unable to write audit record.');
      return;
    }

    setAuditError(null);
    setAuditCount((count) => count + 1);
  }

  async function handleAddPersona(name: string): Promise<void> {
    if (!vault) {
      return;
    }

    await withBusy(async () => {
      const nextPersona: Persona = {
        id: crypto.randomUUID(),
        name,
        createdAt: nowIso()
      };

      const next: VaultStateV1 = {
        ...vault,
        personas: [...vault.personas, nextPersona],
        activePersonaId: nextPersona.id
      };

      setVault(next);
      await persist(next);
      await audit('persona_created', `persona:${nextPersona.id}`);
    });
  }

  async function handleSetActivePersona(personaId: string): Promise<void> {
    if (!vault) {
      return;
    }

    await withBusy(async () => {
      const next: VaultStateV1 = { ...vault, activePersonaId: personaId };
      setVault(next);
      await persist(next);
    });
  }

  function connectorFeedKey(): string | null {
    const trimmed = connectorFeedPublicKeyBase64.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  async function handleUpdateConnectorCatalog(): Promise<void> {
    await withBusy(async () => {
      setConnectorCatalogMeta((meta) => ({ ...meta, error: null }));

      try {
        const fetched = await fetchConnectorFeed({
          feedUrl: connectorFeedUrl,
          publicKeyBase64: connectorFeedKey()
        });

        saveCachedConnectorFeed(fetched);
        setConnectorCatalog(mergeConnectorCatalogs(builtinConnectorCatalog, fetched.feed.connectors));
        setConnectorCatalogMeta({
          source: 'remote',
          catalogVersion: fetched.feed.catalogVersion,
          generatedAt: fetched.feed.generatedAt,
          verified: fetched.verified,
          updatedAt: fetched.cachedAt,
          error: null
        });
        await audit('connector_catalog_updated', `connectors:${fetched.feed.catalogVersion}:${fetched.feed.connectors.length}`);
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : 'Unable to update connector catalog.';
        setConnectorCatalogMeta((meta) => ({ ...meta, error: message }));
      }
    });
  }

  async function handleImportConnectorCatalog(file: File): Promise<void> {
    await withBusy(async () => {
      setConnectorCatalogMeta((meta) => ({ ...meta, error: null }));

      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        setConnectorCatalogMeta((meta) => ({ ...meta, error: 'Connector pack is not valid JSON.' }));
        return;
      }

      const feed = parseConnectorCatalogFeedV1(parsed);
      const connectors = feed?.connectors ?? parseConnectorDefinitions(parsed);
      if (!connectors) {
        setConnectorCatalogMeta((meta) => ({ ...meta, error: 'Connector pack failed validation.' }));
        return;
      }

      const normalizedFeed = feed ?? {
        version: 1 as const,
        catalogVersion: `import-${new Date().toISOString().slice(0, 10)}`,
        generatedAt: new Date().toISOString(),
        connectors
      };

      const cached = {
        cachedAt: new Date().toISOString(),
        feed: normalizedFeed,
        signature: null,
        verified: null,
        sourceUrl: 'import'
      };

      saveCachedConnectorFeed(cached);
      setConnectorCatalog(mergeConnectorCatalogs(builtinConnectorCatalog, normalizedFeed.connectors));
      setConnectorCatalogMeta({
        source: 'import',
        catalogVersion: normalizedFeed.catalogVersion,
        generatedAt: normalizedFeed.generatedAt,
        verified: null,
        updatedAt: cached.cachedAt,
        error: null
      });
      await audit('connector_catalog_updated', `connectors:${normalizedFeed.catalogVersion}:${normalizedFeed.connectors.length}`);
    });
  }

  async function handleAddIdentifier(): Promise<void> {
    if (!vault || !persona) {
      return;
    }

    await withBusy(async () => {
      setError(null);

      const result = validateIdentifierInput(idType, idValue);
      if (!result.ok || !result.normalizedType) {
        setError(result.error);
        await audit('identifier_rejected', result.error ?? 'invalid input');
        return;
      }

      const normalizedType = result.normalizedType;
      const normalizedValue = result.normalizedValue;

      const local = vault.identifiers.filter((identifier) => (identifier.personaId ?? persona.id) === persona.id);
      if (hasDuplicateIdentifier(local, normalizedType, normalizedValue)) {
        setError('This identifier already exists in this persona.');
        await audit('identifier_rejected', 'duplicate identifier');
        return;
      }

      const cross = findCrossPersonaDuplicate(vault.identifiers, persona.id, normalizedType, normalizedValue);
      if (cross && !allowCrossPersonaReuse) {
        setError('This identifier exists in another persona. Enable cross-persona reuse to continue.');
        await audit('identifier_rejected', 'cross-persona reuse blocked');
        return;
      }

      if (!canAddIdentifier(vault.identifiers, config.maxIdentifiers)) {
        setError(`Identifier limit reached (${config.maxIdentifiers}).`);
        await audit('identifier_rejected', 'identifier limit reached');
        return;
      }

      const nextIdentifier: Identifier = {
        id: crypto.randomUUID(),
        personaId: persona.id,
        type: normalizedType,
        value: normalizedValue,
        sensitivity: normalizedType === 'address' ? 3 : 2,
        consent: true,
        createdAt: nowIso()
      };

      const next: VaultStateV1 = { ...vault, identifiers: [...vault.identifiers, nextIdentifier] };
      setVault(next);
      await persist(next);

      setIdValue('');
      const fingerprint = await sha256Hex(`${normalizedType}:${normalizedValue}`);
      await audit('identifier_added', `${normalizedType}:${fingerprint}`);
    });
  }

  async function handleAddAccount(): Promise<void> {
    if (!vault || !persona) {
      return;
    }

    await withBusy(async () => {
      setError(null);
      setAccountsImportStatus(null);

      const service = accountService.trim();
      const username = accountUsername.trim();
      const url = accountUrl.trim();

      if (!service || !username) {
        setError('Service and username are required.');
        return;
      }

      const exists = vault.accounts.some(
        (account) =>
          account.personaId === persona.id &&
          account.service.toLowerCase() === service.toLowerCase() &&
          account.username.toLowerCase() === username.toLowerCase()
      );
      if (exists) {
        setError('This account already exists in this persona.');
        return;
      }

      const nextAccount: Account = {
        id: crypto.randomUUID(),
        personaId: persona.id,
        service,
        username,
        url: url ? url : undefined,
        status: accountStatus,
        createdAt: nowIso()
      };

      const next: VaultStateV1 = { ...vault, accounts: [...vault.accounts, nextAccount] };
      setVault(next);
      await persist(next);

      setAccountService('');
      setAccountUsername('');
      setAccountUrl('');
      setAccountStatus('active');

      await audit('account_added', `account:${nextAccount.id}:${service}`);
    });
  }

  async function handleImportAccounts(file: File): Promise<void> {
    if (!vault || !persona) {
      return;
    }

    await withBusy(async () => {
      setError(null);
      setAccountsImportStatus(null);

      const text = await file.text();
      const parsed = parseAccountsCsv(text);
      if (parsed.rows.length === 0) {
        setError(parsed.errors[0] ?? 'No account rows found in CSV.');
        return;
      }

      const existingKeys = new Set(
        vault.accounts
          .filter((account) => account.personaId === persona.id)
          .map((account) => `${account.service.toLowerCase()}:${account.username.toLowerCase()}`)
      );

      const imported: Account[] = [];
      let skipped = 0;
      parsed.rows.forEach((row) => {
        const key = `${row.service.toLowerCase()}:${row.username.toLowerCase()}`;
        if (existingKeys.has(key)) {
          skipped += 1;
          return;
        }

        existingKeys.add(key);
        imported.push({
          id: crypto.randomUUID(),
          personaId: persona.id,
          service: row.service,
          username: row.username,
          url: row.url,
          lastSeenAt: row.lastSeenAt,
          status: row.status,
          createdAt: nowIso()
        });
      });

      if (imported.length === 0) {
        setAccountsImportStatus(skipped > 0 ? 'No new accounts to import (all duplicates).' : 'No valid account rows found in CSV.');
        return;
      }

      const next: VaultStateV1 = { ...vault, accounts: [...vault.accounts, ...imported] };
      setVault(next);
      await persist(next);
      const warning = parsed.errors.length > 0 ? ` (${parsed.errors[0]})` : '';
      setAccountsImportStatus(
        `Imported ${imported.length} accounts${skipped ? `, skipped ${skipped} duplicates` : ''} (format: ${parsed.format})${warning}.`
      );
      await audit('account_imported', `accounts:${imported.length}:format:${parsed.format}`);
    });
  }

  async function handleImportMailbox(file: File): Promise<void> {
    if (!vault || !persona) {
      return;
    }

    await withBusy(async () => {
      setError(null);
      setAccountsImportStatus(null);

      const maxSizeBytes = 15 * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        setError('Mailbox file is too large for in-browser parsing. Use the local agent for large mbox files.');
        return;
      }

      const text = await file.text();
      const discovered = discoverAccountsFromMbox(text, { maxMessages: 2000 });
      if (discovered.rows.length === 0) {
        setError(discovered.errors[0] ?? 'No accounts discovered in mailbox.');
        return;
      }

      const existingKeys = new Set(
        vault.accounts
          .filter((account) => account.personaId === persona.id)
          .map((account) => `${account.service.toLowerCase()}:${account.username.toLowerCase()}`)
      );

      const imported: Account[] = [];
      let skipped = 0;
      discovered.rows.forEach((row) => {
        const key = `${row.service.toLowerCase()}:${row.username.toLowerCase()}`;
        if (existingKeys.has(key)) {
          skipped += 1;
          return;
        }
        existingKeys.add(key);
        imported.push({
          id: crypto.randomUUID(),
          personaId: persona.id,
          service: row.service,
          username: row.username,
          status: row.status,
          lastSeenAt: row.lastSeenAt,
          createdAt: nowIso()
        });
      });

      if (imported.length === 0) {
        setAccountsImportStatus(skipped > 0 ? 'No new accounts to import (all duplicates).' : 'No valid account rows discovered.');
        return;
      }

      const next: VaultStateV1 = { ...vault, accounts: [...vault.accounts, ...imported] };
      setVault(next);
      await persist(next);

      const warning = discovered.errors.length > 0 ? ` (${discovered.errors[0]})` : '';
      setAccountsImportStatus(
        `Imported ${imported.length} accounts from mailbox${skipped ? `, skipped ${skipped} duplicates` : ''}${warning}.`
      );
      await audit('account_imported', `accounts:${imported.length}:source:mbox`);
    });
  }

  async function handleAddConnector(def: ConnectorDefinition): Promise<void> {
    if (!vault || !persona) {
      return;
    }

    await withBusy(async () => {
      const instance: ConnectorInstance = {
        id: crypto.randomUUID(),
        connectorId: def.id,
        personaId: persona.id,
        state: 'discovered',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        evidence: []
      };

      const next: VaultStateV1 = { ...vault, connectorInstances: [...vault.connectorInstances, instance] };
      setVault(next);
      await persist(next);
      await audit('connector_added', `connector:${def.id}`);
    });
  }

  async function handleExportAgentJob(instanceId: string): Promise<void> {
    if (!vault) {
      return;
    }

    await withBusy(async () => {
      setError(null);

      const instance = vault.connectorInstances.find((item) => item.id === instanceId);
      if (!instance) {
        return;
      }

      const def = getConnectorDefinition(instance.connectorId, connectorCatalog);
      if (!def) {
        setError('Connector definition not found.');
        return;
      }

      const agentSteps = def.steps.filter((step) => step.type === 'agent');
      if (agentSteps.length === 0) {
        setError('This connector has no agent steps.');
        return;
      }

      const job = createAgentJobV1({
        connectorId: instance.connectorId,
        connectorInstanceId: instance.id,
        steps: agentSteps
      });
      downloadJsonFile(`unlinkd-agent-job-${instance.connectorId}-${instance.id}.json`, job);
      await audit('agent_job_exported', `agent:${instance.connectorId}:${instance.id}`);
    });
  }

  async function handleImportAgentResults(file: File): Promise<void> {
    if (!vault || !passphrase) {
      return;
    }

    await withBusy(async () => {
      setError(null);

      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        setError('Agent results file is not valid JSON.');
        return;
      }

      const results = parseAgentResultsV1(parsed);
      if (!results) {
        setError('Agent results file failed validation.');
        return;
      }

      const instance = vault.connectorInstances.find((item) => item.id === results.connectorInstanceId);
      if (!instance) {
        setError('Connector instance referenced by agent results was not found in this vault.');
        return;
      }

      if (instance.connectorId !== results.connectorId) {
        setError('Agent results connector does not match the referenced connector instance.');
        return;
      }

      for (const item of results.evidence) {
        await putEvidencePayload(item.meta.id, item.payload);
      }

      const existingEvidence = new Map<string, EvidenceMeta>();
      instance.evidence.forEach((meta) => existingEvidence.set(meta.id, meta));
      results.evidence.forEach((item) => existingEvidence.set(item.meta.id, item.meta));

      const updated: ConnectorInstance = {
        ...instance,
        evidence: [...existingEvidence.values()],
        updatedAt: nowIso()
      };

      const next: VaultStateV1 = {
        ...vault,
        connectorInstances: vault.connectorInstances.map((item) => (item.id === instance.id ? updated : item))
      };

      setVault(next);
      await persist(next);
      await audit('agent_results_imported', `agent:${results.connectorId}:${results.evidence.length}`);
    });
  }

  async function handleTransition(instanceId: string, to: ConnectorState): Promise<void> {
    if (!vault) {
      return;
    }

    await withBusy(async () => {
      const instance = vault.connectorInstances.find((item) => item.id === instanceId);
      if (!instance) {
        return;
      }

      if (!canTransition(instance.state, to)) {
        setError('Invalid connector transition.');
        return;
      }

      const def = getConnectorDefinition(instance.connectorId, connectorCatalog);
      const nextCheckAt =
        to === 'recheck_scheduled' && def ? addDaysIso(def.defaultRecheckDays) : instance.nextCheckAt;

      const updated: ConnectorInstance = { ...instance, state: to, nextCheckAt, updatedAt: nowIso() };
      const next: VaultStateV1 = {
        ...vault,
        connectorInstances: vault.connectorInstances.map((item) => (item.id === instanceId ? updated : item))
      };

      setVault(next);
      await persist(next);
      await audit('connector_state_changed', `connector:${instance.connectorId}:${instance.state}->${to}`);
    });
  }

  async function handleMarkRechecked(instanceId: string): Promise<void> {
    if (!vault) {
      return;
    }

    await withBusy(async () => {
      setError(null);

      const instance = vault.connectorInstances.find((item) => item.id === instanceId);
      if (!instance) {
        return;
      }

      const def = getConnectorDefinition(instance.connectorId, connectorCatalog);
      const nextCheckAt = addDaysIso(def?.defaultRecheckDays ?? 30);

      const updated: ConnectorInstance = {
        ...instance,
        state: 'recheck_scheduled',
        nextCheckAt,
        updatedAt: nowIso()
      };

      const next: VaultStateV1 = {
        ...vault,
        connectorInstances: vault.connectorInstances.map((item) => (item.id === instanceId ? updated : item))
      };

      setVault(next);
      await persist(next);
      await audit('connector_rechecked', `connector:${instance.connectorId}:${instanceId}`);
    });
  }

  async function handleAddNoteEvidence(instanceId: string): Promise<void> {
    if (!vault || !passphrase) {
      return;
    }

    await withBusy(async () => {
      setError(null);

      const instance = vault.connectorInstances.find((item) => item.id === instanceId);
      if (!instance) {
        return;
      }

      const trimmed = noteBody.trim();
      if (!trimmed) {
        setError('Note content is required.');
        return;
      }

      const bytes = new TextEncoder().encode(trimmed);
      const hash = await sha256HexBytes(bytes);
      const encrypted = await encryptBytes(bytes, passphrase);
      const evidenceId = crypto.randomUUID();
      await putEvidencePayload(evidenceId, encrypted);

      const base = (evidenceLabel.trim() || 'note').replace(/[^a-z0-9._-]+/giu, '_').slice(0, 64);
      const meta: EvidenceMeta = {
        id: evidenceId,
        connectorInstanceId: instanceId,
        kind: 'note',
        filename: `${base}-${new Date().toISOString().slice(0, 10)}.txt`,
        mimeType: 'text/plain',
        size: bytes.length,
        sha256: hash,
        createdAt: nowIso(),
        label: evidenceLabel || undefined
      };

      const updated: ConnectorInstance = { ...instance, evidence: [...instance.evidence, meta], updatedAt: nowIso() };
      const next: VaultStateV1 = {
        ...vault,
        connectorInstances: vault.connectorInstances.map((item) => (item.id === instanceId ? updated : item))
      };

      setVault(next);
      await persist(next);
      setEvidenceLabel('');
      setNoteBody('');
      await audit('evidence_added', `evidence:${evidenceId}:note`);
    });
  }

  async function handleDeleteEvidence(instanceId: string, evidenceId: string): Promise<void> {
    if (!vault) {
      return;
    }

    await withBusy(async () => {
      setError(null);

      const instance = vault.connectorInstances.find((item) => item.id === instanceId);
      if (!instance) {
        return;
      }

      try {
        await deleteEvidencePayload(evidenceId);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'Unable to delete evidence payload.';
        setError(message);
        return;
      }

      const updated: ConnectorInstance = {
        ...instance,
        evidence: instance.evidence.filter((meta) => meta.id !== evidenceId),
        updatedAt: nowIso()
      };

      const next: VaultStateV1 = {
        ...vault,
        connectorInstances: vault.connectorInstances.map((item) => (item.id === instanceId ? updated : item))
      };

      setVault(next);
      await persist(next);
      await audit('evidence_deleted', `evidence:${evidenceId}`);
    });
  }

  async function handleUploadEvidence(instanceId: string, file: File): Promise<void> {
    if (!vault || !passphrase) {
      return;
    }

    await withBusy(async () => {
      setError(null);

      const instance = vault.connectorInstances.find((item) => item.id === instanceId);
      if (!instance) {
        return;
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      const hash = await sha256HexBytes(bytes);
      const encrypted = await encryptBytes(bytes, passphrase);
      const evidenceId = crypto.randomUUID();

      await putEvidencePayload(evidenceId, encrypted);

      const meta: EvidenceMeta = {
        id: evidenceId,
        connectorInstanceId: instanceId,
        kind: evidenceKind,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        sha256: hash,
        createdAt: nowIso(),
        label: evidenceLabel || undefined
      };

      const updated: ConnectorInstance = { ...instance, evidence: [...instance.evidence, meta], updatedAt: nowIso() };
      const next: VaultStateV1 = {
        ...vault,
        connectorInstances: vault.connectorInstances.map((item) => (item.id === instanceId ? updated : item))
      };

      setVault(next);
      await persist(next);
      setEvidenceLabel('');
      await audit('evidence_added', `evidence:${evidenceId}:${evidenceKind}`);
    });
  }

  async function handleDownloadEvidence(meta: EvidenceMeta): Promise<void> {
    if (!passphrase) {
      return;
    }

    await withBusy(async () => {
      const payload = await getEvidencePayload(meta.id);
      if (!payload) {
        setError('Evidence payload not found.');
        return;
      }

      const bytes = await decryptBytes(payload, passphrase);
      if (!bytes) {
        setError('Unable to decrypt evidence with the provided passphrase.');
        return;
      }

      const blob = new Blob([bytes], { type: meta.mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = meta.filename;
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  async function handleVerifyAudit(): Promise<void> {
    if (!passphrase) {
      setAuditError('Unlock storage before verifying the audit chain.');
      return;
    }

    await withBusy(async () => {
      const ok = await verifyAuditChain(passphrase);
      setAuditError(ok ? null : 'Audit chain verification failed.');
    });
  }

  async function handleRunLocalScan(): Promise<void> {
    if (!vault) {
      return;
    }

    await withBusy(async () => {
      const findings = await runLocalScan(vault);
      const merged = new Map<string, RiskFinding>();
      [...vault.findings, ...findings].forEach((finding) => merged.set(finding.id, finding));
      const next: VaultStateV1 = { ...vault, findings: [...merged.values()] };
      setVault(next);
      await persist(next);
      await audit('scan_ran', `scan:local:${findings.length}`);
    });
  }

  async function handleExportReport(redacted: boolean): Promise<void> {
    if (!vault) {
      return;
    }

    await withBusy(async () => {
      const md = buildMarkdownReport(vault, { redacted, connectorCatalog });
      downloadTextFile(`unlinkd-report-${new Date().toISOString().slice(0, 10)}.md`, md);
    });
  }

  async function handleExportBackup(): Promise<void> {
    await withBusy(async () => {
      const backup = await exportBackup();
      downloadJsonFile(`unlinkd-backup-${new Date().toISOString().slice(0, 10)}.json`, backup);
      await audit('vault_exported', 'backup:export');
    });
  }

  async function handleImportBackup(file: File): Promise<void> {
    await withBusy(async () => {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') {
        setError('Invalid backup file.');
        return;
      }

      await importBackup(parsed as never);
      setError(null);

      // Re-unlock after import.
      const loaded = passphrase ? await unlockVault(passphrase) : null;
      if (loaded) {
        setVault(loaded);
        setIsUnlocked(true);
      } else {
        setVault(null);
        setIsUnlocked(false);
      }

      await audit('vault_imported', 'backup:import');
    });
  }

  async function handleWipeAllData(): Promise<void> {
    await withBusy(async () => {
      await wipeAllData();
      setVault(null);
      setIsUnlocked(false);
      setError(null);
      setAuditError(null);
      setAuditCount(0);
    });
  }

  if (!isUnlocked || !vault || !persona) {
    return (
      <main>
        <h1>unlinkd</h1>
        <p>Local-first digital disappearance workflows and OSINT self-scan tooling.</p>
        <section>
          <h2>Unlock</h2>
          <label htmlFor="vault-passphrase">Passphrase</label>
          <input
            id="vault-passphrase"
            type="password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            placeholder="enter passphrase"
          />
          <button type="button" onClick={() => void handleUnlock()}>
            Unlock Storage
          </button>
          <button type="button" onClick={() => void handleResetVault()}>
            Create Fresh Vault
          </button>
          {error ? <p role="alert">{error}</p> : null}
          {auditError ? <p role="status">{auditError}</p> : null}
        </section>
      </main>
    );
  }

  const connectorInstances = vault.connectorInstances.filter((item) => item.personaId === persona.id);
  const due = dueConnectors(connectorInstances);

  return (
    <main>
      <h1>unlinkd</h1>
      <p>{`Persona: ${persona.name}`}</p>
      <nav>
        <button type="button" onClick={() => setTab('dashboard')}>
          Dashboard
        </button>
        <button type="button" onClick={() => setTab('personas')}>
          Personas
        </button>
        <button type="button" onClick={() => setTab('identifiers')}>
          Identifiers
        </button>
        <button type="button" onClick={() => setTab('accounts')}>
          Accounts
        </button>
        <button type="button" onClick={() => setTab('connectors')}>
          Connectors
        </button>
        <button type="button" onClick={() => setTab('findings')}>
          Findings
        </button>
        <button type="button" onClick={() => setTab('report')}>
          Report
        </button>
        <button type="button" onClick={() => setTab('backup')}>
          Backup
        </button>
      </nav>

      {error ? <p role="alert">{error}</p> : null}

	      {tab === 'dashboard' ? (
	        <section>
	          <h2>Dashboard</h2>
	          <p>{`Identifiers (active persona): ${personaIdentifiers.length}`}</p>
	          <p>{`Accounts (active persona): ${personaAccounts.length}`}</p>
	          <p>{`Graph nodes: ${exposureGraph.nodes.length}`}</p>
	          <p>{`Graph edges: ${exposureGraph.edges.length}`}</p>
	          <p>{`Connectors (active persona): ${connectorInstances.length}`}</p>
	          <p>{`Due rechecks: ${due.length}`}</p>
	          {due.length > 0 ? (
	            <section>
	              <h3>Due Rechecks</h3>
	              <ul>
	                {due.map((instance) => (
	                  <li key={instance.id}>
	                    <span>{`${connectorName(instance.connectorId, connectorCatalog)} (due: ${instance.nextCheckAt ?? 'unknown'})`}</span>{' '}
	                    <button type="button" onClick={() => void handleMarkRechecked(instance.id)}>
	                      Mark Rechecked
	                    </button>
	                  </li>
	                ))}
	              </ul>
	            </section>
	          ) : null}
	          <button type="button" onClick={() => void handleRunLocalScan()}>
	            Run Local Scan
	          </button>
          <section>
            <h3>Audit</h3>
            <p>{`Entries: ${auditCount}`}</p>
            <button type="button" onClick={() => void handleVerifyAudit()}>
              Verify Audit Chain
            </button>
            {auditError ? <p role="status">{auditError}</p> : null}
          </section>
        </section>
      ) : null}

      {tab === 'personas' ? (
        <section>
          <h2>Personas</h2>
          <ul>
            {vault.personas.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => void handleSetActivePersona(p.id)}>
                  {p.id === vault.activePersonaId ? `Active: ${p.name}` : p.name}
                </button>
              </li>
            ))}
          </ul>
          <PersonaCreateForm onCreate={(name) => void handleAddPersona(name)} />
        </section>
      ) : null}

      {tab === 'identifiers' ? (
        <section>
          <h2>Identifiers</h2>
          <label htmlFor="identifier-type">Type</label>
          <select id="identifier-type" value={idType} onChange={(event) => setIdType(event.target.value as IdentifierType)}>
            {identifierTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <label htmlFor="identifier-value">Value</label>
          <input
            id="identifier-value"
            value={idValue}
            onChange={(event) => setIdValue(event.target.value)}
            placeholder="enter identifier"
          />
          <label>
            <input
              type="checkbox"
              checked={allowCrossPersonaReuse}
              onChange={(event) => setAllowCrossPersonaReuse(event.target.checked)}
            />
            Allow cross-persona reuse
          </label>
          <button type="button" onClick={() => void handleAddIdentifier()}>
            Add Identifier
          </button>
          <ul>
            {personaIdentifiers.map((identifier) => (
              <li key={identifier.id}>{`${identifier.type}: ${identifier.value}`}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === 'accounts' ? (
        <section>
          <h2>Accounts</h2>
          <p>{`Accounts (active persona): ${personaAccounts.length}`}</p>

          <h3>Add Account</h3>
          <label htmlFor="account-service">Service</label>
          <input
            id="account-service"
            value={accountService}
            onChange={(event) => setAccountService(event.target.value)}
            placeholder="e.g. gmail, instagram, bank"
          />
          <label htmlFor="account-username">Username</label>
          <input
            id="account-username"
            value={accountUsername}
            onChange={(event) => setAccountUsername(event.target.value)}
            placeholder="e.g. handle, email, user id"
          />
          <label htmlFor="account-url">URL (optional)</label>
          <input
            id="account-url"
            value={accountUrl}
            onChange={(event) => setAccountUrl(event.target.value)}
            placeholder="https://..."
          />
          <label htmlFor="account-status">Status</label>
          <select
            id="account-status"
            value={accountStatus}
            onChange={(event) => setAccountStatus(event.target.value as AccountStatus)}
          >
            {accountStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void handleAddAccount()}>
            Add Account
          </button>

          <h3>Import Accounts CSV</h3>
          <p>Auto-detects common exports (Bitwarden, 1Password, LastPass, Chrome) or generic `service`/`username` CSV.</p>
          <label>
            CSV file
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (file) {
                  void handleImportAccounts(file);
                }
              }}
            />
          </label>
          {accountsImportStatus ? <p role="status">{accountsImportStatus}</p> : null}

          <h3>Mailbox Discovery (.mbox)</h3>
          <p>Extracts candidate accounts from `From` + `Delivered-To`/`To` headers (best for small exports).</p>
          <label>
            Mbox file
            <input
              type="file"
              accept=".mbox,text/plain"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (file) {
                  void handleImportMailbox(file);
                }
              }}
            />
          </label>

          <h3>Account List</h3>
          <ul>
            {personaAccounts.map((account) => (
              <li key={account.id}>
                <strong>{account.service}</strong>
                <span>{` @ ${account.username}`}</span>
                <span>{` (${account.status})`}</span>
                {account.lastSeenAt ? <span>{` last seen ${account.lastSeenAt}`}</span> : null}
                {account.url ? (
                  <a href={account.url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
          {personaAccounts.length === 0 ? <p>(none)</p> : null}
        </section>
      ) : null}

      {tab === 'connectors' ? (
        <section>
          <h2>Connectors</h2>
          <h3>Catalog</h3>
          <p>{`Catalog version: ${connectorCatalogMeta.catalogVersion} (${connectorCatalogMeta.source})`}</p>
          {connectorCatalogMeta.generatedAt ? <p>{`Generated: ${connectorCatalogMeta.generatedAt}`}</p> : null}
          {connectorCatalogMeta.updatedAt ? <p>{`Updated: ${connectorCatalogMeta.updatedAt}`}</p> : null}
          <p>{`Signature verified: ${
            connectorCatalogMeta.verified === null ? 'unknown' : connectorCatalogMeta.verified ? 'yes' : 'no'
          }`}</p>
          <button type="button" onClick={() => void handleUpdateConnectorCatalog()}>
            Update Catalog
          </button>
          <label>
            Import Connector Pack (JSON)
            <input
              type="file"
              accept="application/json"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (file) {
                  void handleImportConnectorCatalog(file);
                }
              }}
            />
          </label>
          {connectorCatalogMeta.error ? <p role="alert">{connectorCatalogMeta.error}</p> : null}

          <h3>Agent</h3>
          <label>
            Import Agent Results (JSON)
            <input
              type="file"
              accept="application/json"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (file) {
                  void handleImportAgentResults(file);
                }
              }}
            />
          </label>

          <ul>
            {connectorCatalog.map((def) => (
              <li key={def.id}>
                <strong>{def.name}</strong>
                <p>{def.description}</p>
                <button type="button" onClick={() => void handleAddConnector(def)}>
                  Add To Persona
                </button>
              </li>
            ))}
          </ul>

          <h3>My Connectors</h3>
          <ul>
            {connectorInstances.map((instance) => {
              const def = getConnectorDefinition(instance.connectorId, connectorCatalog);
              const allowed = nextStates(instance.state);
              return (
                <li key={instance.id}>
                  <strong>{connectorName(instance.connectorId, connectorCatalog)}</strong>
                  <p>{`State: ${instance.state}`}</p>
                  {instance.nextCheckAt ? <p>{`Next check: ${instance.nextCheckAt}`}</p> : null}
                  {def && def.steps.some((step) => step.type === 'agent') ? (
                    <button type="button" onClick={() => void handleExportAgentJob(instance.id)}>
                      Export Agent Job
                    </button>
                  ) : null}
                  {allowed.length > 0 ? (
                    <div>
                      {allowed.map((state) => (
                        <button key={state} type="button" onClick={() => void handleTransition(instance.id, state)}>
                          {`Move → ${state}`}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {def ? (
                    <ol>
                      {def.steps.map((step) => (
                        <li key={step.id}>
                          <strong>{step.title}</strong>
                          {step.type === 'manual' ? (
                            <p>{step.instructions}</p>
                          ) : (
                            <p>{`Agent step: ${step.action.kind}`}</p>
                          )}
                          {step.evidenceHint ? <p>{`Evidence hint: ${step.evidenceHint}`}</p> : null}
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  <section>
                    <h4>Evidence</h4>
                    <label>
                      Kind
                      <select value={evidenceKind} onChange={(event) => setEvidenceKind(event.target.value as EvidenceKind)}>
                        <option value="file">file</option>
                        <option value="screenshot">screenshot</option>
                        <option value="pdf">pdf</option>
                        <option value="email">email</option>
                        <option value="note">note</option>
                      </select>
                    </label>
                    <label>
                      Label
                      <input value={evidenceLabel} onChange={(event) => setEvidenceLabel(event.target.value)} placeholder="optional label" />
                    </label>
                    {evidenceKind === 'note' ? (
                      <div>
                        <label htmlFor={`note-body-${instance.id}`}>Note</label>
                        <textarea
                          id={`note-body-${instance.id}`}
                          value={noteBody}
                          onChange={(event) => setNoteBody(event.target.value)}
                          placeholder="enter note"
                        />
                        <button type="button" onClick={() => void handleAddNoteEvidence(instance.id)}>
                          Add Note Evidence
                        </button>
                      </div>
                    ) : (
                      <input
                        type="file"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          if (file) {
                            void handleUploadEvidence(instance.id, file);
                          }
                        }}
                      />
                    )}
                    <ul>
                      {instance.evidence.map((meta) => (
                        <li key={meta.id}>
                          <button type="button" onClick={() => void handleDownloadEvidence(meta)}>
                            {`Download: ${meta.filename}`}
                          </button>
                          <button type="button" onClick={() => void handleDeleteEvidence(instance.id, meta.id)}>
                            Delete
                          </button>
                          <span>{` [${meta.kind}]`}</span>
                          {meta.label ? <span>{` (${meta.label})`}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {tab === 'findings' ? (
        <section>
          <h2>Findings</h2>
          <ol>
            {prioritizedFindings.map((finding) => (
              <li key={finding.id}>
                <strong>{finding.title}</strong>
                <p>{`Tier: ${finding.tier}, score: ${finding.harm}/${finding.exploitability}`}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {tab === 'report' ? (
        <section>
          <h2>Report</h2>
          <button type="button" onClick={() => void handleExportReport(true)}>
            Export Redacted Markdown
          </button>
          <button type="button" onClick={() => void handleExportReport(false)}>
            Export Full Markdown (Sensitive)
          </button>
        </section>
      ) : null}

      {tab === 'backup' ? (
        <section>
          <h2>Backup</h2>
          <button type="button" onClick={() => void handleExportBackup()}>
            Export Backup (Encrypted)
          </button>
          <label>
            Import Backup
            <input
              type="file"
              accept="application/json"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (file) {
                  void handleImportBackup(file);
                }
              }}
            />
          </label>
          <button type="button" onClick={() => void handleWipeAllData()}>
            Wipe All Local Data
          </button>
        </section>
      ) : null}
    </main>
  );
}

function PersonaCreateForm(props: { onCreate: (name: string) => void }): React.JSX.Element {
  const [name, setName] = useState('');

  return (
    <section>
      <h3>Create Persona</h3>
      <label htmlFor="persona-name">Name</label>
      <input id="persona-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Personal, Work, Pseudonymous" />
      <button
        type="button"
        onClick={() => {
          const trimmed = name.trim();
          if (!trimmed) {
            return;
          }

          props.onCreate(trimmed);
          setName('');
        }}
      >
        Create
      </button>
    </section>
  );
}
