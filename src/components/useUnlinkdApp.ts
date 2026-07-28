import { useEffect, useMemo, useRef, useState } from 'react';
import { appendAuditRecord, loadAuditRecords, verifyAuditChain } from '../core/audit';
import { createAgentJobV1, parseAgentResultsV1 } from '../core/agent';
import { exportBackup, importBackup, wipeAllData } from '../core/backup';
import { getAppConfig } from '../core/config';
import { decryptBytes, encryptBytes, sha256Hex, sha256HexBytes } from '../core/crypto';
import { deleteEvidencePayload, getEvidencePayload, putEvidencePayload } from '../core/evidence';
import type { FindingStatus } from '../core/findings';
import { buildExposureGraph } from '../core/graph';
import { checkPasswordPwned, generateManualCheckSuggestions } from '../core/hibp';
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
  Persona
} from '../core/types';
import { validateIdentifierInput } from '../core/validation';
import { canTransition } from '../core/workflow';
import {
  createEmptyVault,
  loadVault,
  resetVaultSyncState,
  saveVault,
  unlockVault,
  VaultConflictError,
  vaultExists,
  type VaultStateV1
} from '../core/vault';
import { broadcastVaultChanged, subscribeVaultChanged } from '../core/sync';
import {
  builtinConnectorCatalog,
  builtinConnectorCatalogVersion,
  getConnectorDefinition,
  mergeConnectorCatalogs,
  type ConnectorCatalogMeta
} from '../connectors/catalog';
import { dueConnectorInstances } from '../core/connectors';
import {
  addAccount,
  addConnectorInstance,
  addIdentifier,
  addPersona,
  applyConnectorTransition,
  mergeScanFindings,
  replaceConnectorInstance,
  setActivePersona,
  setFindingStatusInVault,
  setHibpApiKey,
  setLastBackupExportAt
} from '../core/vaultReducer';
import {
  backupFreshness,
  readStorageHealth,
  requestPersistentStorage,
  type StorageHealth
} from '../core/storage';
import { countLegacyEvidence, upgradeLegacyEvidence } from '../core/maintenance';
import {
  notificationPermission,
  notificationsSupported,
  notifyRechecksDue,
  requestNotificationPermission
} from './notifications';
import {
  fetchConnectorFeed,
  loadVerifiedCachedConnectorFeed,
  parseConnectorCatalogFeedV1,
  parseConnectorDefinitions,
  saveCachedConnectorFeed
} from '../connectors/feed';
import { buildMarkdownReport } from '../core/report';
import { nowIso } from '../core/utils';
import { discoverAccountsFromMbox, parseAccountsCsv } from '../core/import/accounts';

export type Tab =
  | 'dashboard'
  | 'personas'
  | 'identifiers'
  | 'accounts'
  | 'connectors'
  | 'findings'
  | 'report'
  | 'settings'
  | 'backup';

export const tabItems: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'personas', label: 'Personas' },
  { id: 'identifiers', label: 'Identifiers' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'connectors', label: 'Connectors' },
  { id: 'findings', label: 'Findings' },
  { id: 'report', label: 'Report' },
  { id: 'settings', label: 'Settings' },
  { id: 'backup', label: 'Backup' }
];

const config = getAppConfig();

const connectorFeedUrl = import.meta.env.VITE_CONNECTOR_FEED_URL ?? '/connectors/catalog.v1.json';
const connectorFeedPublicKeyBase64 =
  import.meta.env.VITE_CONNECTOR_FEED_PUBKEY ?? 'sRrWiocnHbnAcLQ59Bl6gQVUoDUVeLVw2lesvu2mWKM=';

/** Auto-lock the vault after this much inactivity (privacy default). */
export const AUTO_LOCK_MINUTES = 15;

/** Only http(s) URLs may be stored on accounts and rendered as links. */
export function sanitizeHttpUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

function addDaysIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function downloadBlob(filename: string, blob: Blob): void {
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

function downloadTextFile(filename: string, content: string): void {
  downloadBlob(filename, new Blob([content], { type: 'text/plain;charset=utf-8' }));
}

function downloadJsonFile(filename: string, value: unknown): void {
  downloadTextFile(filename, JSON.stringify(value, null, 2));
}

function activePersona(vault: VaultStateV1): Persona {
  return vault.personas.find((persona) => persona.id === vault.activePersonaId) ?? vault.personas[0]!;
}


export function useUnlinkdApp() {
  const busyRef = useRef(false);

  const [tab, setTab] = useState<Tab>('dashboard');

  const [passphrase, setPassphrase] = useState('');
  const [vault, setVault] = useState<VaultStateV1 | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [vaultPresent, setVaultPresent] = useState<boolean>(() => vaultExists());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditCount, setAuditCount] = useState<number>(0);
  const [connectorCatalog, setConnectorCatalog] = useState<ConnectorDefinition[]>(builtinConnectorCatalog);
  const [connectorCatalogMeta, setConnectorCatalogMeta] = useState<ConnectorCatalogMeta>({
    source: 'builtin',
    catalogVersion: builtinConnectorCatalogVersion,
    generatedAt: null,
    verified: null,
    updatedAt: null,
    error: null
  });

  const [accountsImportStatus, setAccountsImportStatus] = useState<string | null>(null);
  const [storageHealth, setStorageHealth] = useState<StorageHealth | null>(null);
  const [legacyEvidenceCount, setLegacyEvidenceCount] = useState(0);
  const [remindersEnabled, setRemindersEnabled] = useState<boolean>(() => notificationPermission() === 'granted');

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

  const manualSuggestions = useMemo(
    () => generateManualCheckSuggestions(personaIdentifiers),
    [personaIdentifiers]
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const cached = await loadVerifiedCachedConnectorFeed(connectorFeedKey());
      if (!cached || cancelled) {
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
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function withBusy<T>(fn: () => Promise<T>): Promise<T | null> {
    if (busyRef.current) {
      // Never silently swallow a user action: previously concurrent clicks were
      // dropped with no feedback at all.
      setError('Another operation is still in progress — wait a moment and try again.');
      return null;
    }

    busyRef.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function persist(next: VaultStateV1): Promise<boolean> {
    if (!passphrase) {
      setError('Passphrase missing.');
      return false;
    }

    try {
      await saveVault(next, passphrase);
      // Let peer tabs re-read immediately instead of drifting until they
      // conflict on their own next write.
      broadcastVaultChanged();
      return true;
    } catch (caught) {
      if (caught instanceof VaultConflictError) {
        // Another tab won the race. Re-read so this tab shows the truth rather
        // than state that was never written.
        const reloaded = await loadVault(passphrase);
        if (reloaded) {
          setVault(reloaded);
        }
        setError(`${caught.message} Your last change was not saved.`);
        return false;
      }

      const message = caught instanceof Error ? caught.message : 'Unable to persist vault.';
      setError(message);
      return false;
    }
  }

  function lockVault(reason?: string): void {
    resetVaultSyncState();
    setVault(null);
    setIsUnlocked(false);
    setPassphrase('');
    setShowOnboarding(false);
    setTab('dashboard');
    setError(null);
    setAuditError(null);
    setAuditCount(0);
    setAccountsImportStatus(null);
    setNotice(reason ?? null);
  }

  function handleLock(): void {
    lockVault('Vault locked. Your data stays encrypted on this device.');
  }

  // Ask the browser not to evict this origin's storage. Without this, both
  // localStorage and IndexedDB are best-effort and can be cleared under disk
  // pressure — which, with no recovery path, means total data loss.
  useEffect(() => {
    if (!isUnlocked) {
      return;
    }

    let cancelled = false;
    void (async () => {
      await requestPersistentStorage();
      const health = await readStorageHealth();
      const legacy = await countLegacyEvidence();
      if (!cancelled) {
        setStorageHealth(health);
        setLegacyEvidenceCount(legacy);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isUnlocked]);

  // Re-read the vault when another tab writes it, so both tabs converge instead
  // of drifting until one of them loses a conflict.
  useEffect(() => {
    if (!isUnlocked || !passphrase) {
      return;
    }

    return subscribeVaultChanged(() => {
      void (async () => {
        const reloaded = await loadVault(passphrase);
        if (reloaded) {
          setVault(reloaded);
          setNotice('Picked up changes made in another tab.');
        }
      })();
    });
  }, [isUnlocked, passphrase]);

  // Auto-lock after inactivity: clears the passphrase and decrypted vault from
  // memory so an unattended machine does not stay exposed indefinitely.
  useEffect(() => {
    if (!isUnlocked) {
      return;
    }

    const autoLockMs = AUTO_LOCK_MINUTES * 60 * 1000;
    let timer = window.setTimeout(fire, autoLockMs);

    function fire(): void {
      lockVault(`Locked after ${AUTO_LOCK_MINUTES} minutes of inactivity.`);
    }

    function reset(): void {
      window.clearTimeout(timer);
      timer = window.setTimeout(fire, autoLockMs);
    }

    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    events.forEach((name) => window.addEventListener(name, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, reset));
    };
  }, [isUnlocked]);

  async function loadAuditCount(pass: string): Promise<void> {
    const auditRecords = await loadAuditRecords(pass);
    if (!auditRecords) {
      setAuditError('Unable to unlock audit log with the provided passphrase.');
      setAuditCount(0);
      return;
    }

    setAuditCount(auditRecords.length);
    // Passively verify integrity on unlock. Previously verification only ran on
    // an explicit button click, so a tampered chain went unnoticed in normal use.
    const intact = await verifyAuditChain(pass);
    setAuditError(intact ? null : 'Audit log integrity check failed — records may have been altered.');
  }

  async function handleUnlock(): Promise<void> {
    await withBusy(async () => {
      setError(null);
      setAuditError(null);
      setNotice(null);

      if (!passphrase) {
        setError('Passphrase is required to unlock storage.');
        return;
      }

      const loaded = await loadVault(passphrase);
      if (!loaded) {
        setError('Incorrect passphrase, or the stored vault is corrupted.');
        return;
      }

      setVault(loaded);
      setIsUnlocked(true);
      setVaultPresent(true);
      await loadAuditCount(passphrase);

      // Surface overdue rechecks as a desktop reminder on unlock (no-op unless
      // the user has opted in). This is the closest a no-backend app gets to the
      // "recheck cadence" the connector model promises. Count only the active
      // persona so the reminder matches what the dashboard will show.
      const active = activePersona(loaded);
      notifyRechecksDue(
        dueConnectorInstances(
          loaded.connectorInstances.filter((item) => item.personaId === active.id)
        ).length
      );
    });
  }

  async function handleEnableReminders(): Promise<void> {
    const granted = await requestNotificationPermission();
    setRemindersEnabled(granted);
    if (granted && vault) {
      notifyRechecksDue(dueConnectorInstances(vault.connectorInstances).length);
    }
  }

  async function handleCreateVault(): Promise<void> {
    await withBusy(async () => {
      setError(null);
      setAuditError(null);
      setNotice(null);

      if (!passphrase) {
        setError('Passphrase is required.');
        return;
      }

      // Guard against a stale create screen: another tab may have created a
      // vault since this one loaded, and overwriting it would destroy it.
      if (vaultExists()) {
        setVaultPresent(true);
        setError('A vault already exists on this device (possibly created in another tab). Unlock it instead.');
        return;
      }

      const empty = createEmptyVault();
      await saveVault(empty, passphrase);
      setVault(empty);
      setIsUnlocked(true);
      setVaultPresent(true);
      setAuditCount(0);
      setShowOnboarding(true);
    });
  }

  async function handleWipeAndRecreate(): Promise<void> {
    await withBusy(async () => {
      try {
        await wipeAllData();
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'Unable to wipe local data.';
        setError(`Wipe failed — some data may remain on this device. ${message}`);
        return;
      }

      lockVault('All local data has been wiped from this device.');
      setVaultPresent(false);
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
      setError(null);

      const nextPersona: Persona = {
        id: crypto.randomUUID(),
        name,
        createdAt: nowIso()
      };

      const next = addPersona(vault, nextPersona);
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
      setError(null);

      const next = setActivePersona(vault, personaId);
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
        const cached = await loadVerifiedCachedConnectorFeed(connectorFeedKey());
        const fetched = await fetchConnectorFeed({
          feedUrl: connectorFeedUrl,
          publicKeyBase64: connectorFeedKey(),
          // Reject a feed older than the one we already trust (rollback/replay).
          // Only a signature-verified cache sets the watermark: an unsigned
          // manual import must not be able to wedge or poison signed updates.
          minGeneratedAt: cached?.verified === true ? cached.feed.generatedAt : null
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
        const message = caught instanceof Error ? caught.message : 'Unable to update connector catalog.';
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
        feedText: JSON.stringify(normalizedFeed),
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

  async function handleAddIdentifier(idType: IdentifierType, idValue: string, allowCrossPersonaReuse: boolean): Promise<boolean> {
    if (!vault || !persona) {
      return false;
    }

    const result = await withBusy(async () => {
      setError(null);

      const validated = validateIdentifierInput(idType, idValue);
      if (!validated.ok || !validated.normalizedType) {
        setError(validated.error);
        await audit('identifier_rejected', validated.error ?? 'invalid input');
        return false;
      }

      const normalizedType = validated.normalizedType;
      const normalizedValue = validated.normalizedValue;

      const local = vault.identifiers.filter((identifier) => (identifier.personaId ?? persona.id) === persona.id);
      if (hasDuplicateIdentifier(local, normalizedType, normalizedValue)) {
        setError('This identifier already exists in this persona.');
        await audit('identifier_rejected', 'duplicate identifier');
        return false;
      }

      const cross = findCrossPersonaDuplicate(vault.identifiers, persona.id, normalizedType, normalizedValue);
      if (cross && !allowCrossPersonaReuse) {
        setError('This identifier exists in another persona. Enable cross-persona reuse to continue.');
        await audit('identifier_rejected', 'cross-persona reuse blocked');
        return false;
      }

      if (!canAddIdentifier(vault.identifiers, config.maxIdentifiers)) {
        setError(`Identifier limit reached (${config.maxIdentifiers}).`);
        await audit('identifier_rejected', 'identifier limit reached');
        return false;
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

      const next = addIdentifier(vault, nextIdentifier);
      setVault(next);
      await persist(next);

      const fingerprint = await sha256Hex(`${normalizedType}:${normalizedValue}`);
      await audit('identifier_added', `${normalizedType}:${fingerprint}`);
      return true;
    });

    return result ?? false;
  }

  async function handleAddAccount(service: string, username: string, url: string, status: AccountStatus): Promise<boolean> {
    if (!vault || !persona) {
      return false;
    }

    const result = await withBusy(async () => {
      setError(null);
      setAccountsImportStatus(null);

      const trimmedService = service.trim();
      const trimmedUsername = username.trim();
      const trimmedUrl = url.trim();

      if (!trimmedService || !trimmedUsername) {
        setError('Service and username are required.');
        return false;
      }

      const safeUrl = trimmedUrl ? sanitizeHttpUrl(trimmedUrl) : null;
      if (trimmedUrl && !safeUrl) {
        setError('Account URL must be a valid http(s) URL.');
        return false;
      }

      const exists = vault.accounts.some(
        (account) =>
          account.personaId === persona.id &&
          account.service.toLowerCase() === trimmedService.toLowerCase() &&
          account.username.toLowerCase() === trimmedUsername.toLowerCase()
      );
      if (exists) {
        setError('This account already exists in this persona.');
        return false;
      }

      const nextAccount: Account = {
        id: crypto.randomUUID(),
        personaId: persona.id,
        service: trimmedService,
        username: trimmedUsername,
        url: safeUrl ?? undefined,
        status,
        createdAt: nowIso()
      };

      const next = addAccount(vault, nextAccount);
      setVault(next);
      await persist(next);

      await audit('account_added', `account:${nextAccount.id}:${trimmedService}`);
      return true;
    });

    return result ?? false;
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
          // Never store a non-http(s) URL from an untrusted CSV: it is later
          // rendered as a clickable link.
          url: row.url ? (sanitizeHttpUrl(row.url) ?? undefined) : undefined,
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

      const next = addConnectorInstance(vault, instance);
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

      const next = replaceConnectorInstance(vault, updated);

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

      setError(null);

      const def = getConnectorDefinition(instance.connectorId, connectorCatalog);
      const nextCheckAt =
        to === 'recheck_scheduled'
          ? addDaysIso(def?.defaultRecheckDays ?? 30)
          : instance.nextCheckAt;

      const next = applyConnectorTransition(vault, instanceId, { to, nextCheckAt, updatedAt: nowIso() });

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

      const next = applyConnectorTransition(vault, instanceId, {
        to: 'recheck_scheduled',
        nextCheckAt,
        updatedAt: nowIso()
      });

      setVault(next);
      await persist(next);
      await audit('connector_rechecked', `connector:${instance.connectorId}:${instanceId}`);
    });
  }

  async function handleAddNoteEvidence(instanceId: string, body: string, label: string): Promise<boolean> {
    if (!vault || !passphrase) {
      return false;
    }

    const result = await withBusy(async () => {
      setError(null);

      const instance = vault.connectorInstances.find((item) => item.id === instanceId);
      if (!instance) {
        return false;
      }

      const trimmed = body.trim();
      if (!trimmed) {
        setError('Note content is required.');
        return false;
      }

      const bytes = new TextEncoder().encode(trimmed);
      const hash = await sha256HexBytes(bytes);
      const encrypted = await encryptBytes(bytes, passphrase);
      const evidenceId = crypto.randomUUID();
      await putEvidencePayload(evidenceId, encrypted);

      const base = (label.trim() || 'note').replace(/[^a-z0-9._-]+/giu, '_').slice(0, 64);
      const meta: EvidenceMeta = {
        id: evidenceId,
        connectorInstanceId: instanceId,
        kind: 'note',
        filename: `${base}-${new Date().toISOString().slice(0, 10)}.txt`,
        mimeType: 'text/plain',
        size: bytes.length,
        sha256: hash,
        createdAt: nowIso(),
        label: label || undefined
      };

      const updated: ConnectorInstance = { ...instance, evidence: [...instance.evidence, meta], updatedAt: nowIso() };
      const next: VaultStateV1 = {
        ...vault,
        connectorInstances: vault.connectorInstances.map((item) => (item.id === instanceId ? updated : item))
      };

      setVault(next);
      await persist(next);
      await audit('evidence_added', `evidence:${evidenceId}:note`);
      return true;
    });

    return result ?? false;
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

  async function handleUploadEvidence(instanceId: string, file: File, kind: EvidenceKind, label: string): Promise<boolean> {
    if (!vault || !passphrase) {
      return false;
    }

    const result = await withBusy(async () => {
      setError(null);

      const instance = vault.connectorInstances.find((item) => item.id === instanceId);
      if (!instance) {
        return false;
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      const hash = await sha256HexBytes(bytes);
      const encrypted = await encryptBytes(bytes, passphrase);
      const evidenceId = crypto.randomUUID();

      await putEvidencePayload(evidenceId, encrypted);

      const meta: EvidenceMeta = {
        id: evidenceId,
        connectorInstanceId: instanceId,
        kind,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        sha256: hash,
        createdAt: nowIso(),
        label: label || undefined
      };

      const updated: ConnectorInstance = { ...instance, evidence: [...instance.evidence, meta], updatedAt: nowIso() };
      const next: VaultStateV1 = {
        ...vault,
        connectorInstances: vault.connectorInstances.map((item) => (item.id === instanceId ? updated : item))
      };

      setVault(next);
      await persist(next);
      await audit('evidence_added', `evidence:${evidenceId}:${kind}`);
      return true;
    });

    return result ?? false;
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

      downloadBlob(meta.filename, new Blob([bytes], { type: meta.mimeType }));
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
      const findings = await runLocalScan(vault, {
        hibpConfig: { apiKey: vault.settings.hibpApiKey ?? null }
      });
      const next = mergeScanFindings(vault, findings);
      setVault(next);
      await persist(next);
      await audit('scan_ran', `scan:local:${findings.length}`);
    });
  }

  async function handleSetFindingStatus(id: string, status: FindingStatus): Promise<void> {
    if (!vault) {
      return;
    }

    await withBusy(async () => {
      const next = setFindingStatusInVault(vault, id, status);
      setVault(next);
      await persist(next);
      await audit('finding_status_changed', `finding:${id}:${status}`);
    });
  }

  async function handleSaveHibpApiKey(key: string): Promise<boolean> {
    if (!vault) {
      return false;
    }

    const result = await withBusy(async () => {
      const next = setHibpApiKey(vault, key);
      setVault(next);
      if (!(await persist(next))) {
        return false;
      }

      await audit('settings_updated', `settings:hibpApiKey:${key.trim().length > 0 ? 'set' : 'cleared'}`);
      return true;
    });

    return result ?? false;
  }

  async function handleCheckPassword(password: string): Promise<number | null> {
    try {
      return await checkPasswordPwned(password);
    } catch {
      return null;
    }
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

      // Record the export so the app can stop nagging (and start again later).
      if (vault) {
        const next = setLastBackupExportAt(vault, nowIso());
        setVault(next);
        await persist(next);
      }

      await audit('vault_exported', 'backup:export');
    });
  }

  async function handleImportBackup(file: File): Promise<void> {
    await withBusy(async () => {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setError('Invalid backup file: not valid JSON.');
        return;
      }

      try {
        // Pass the current passphrase so a backup that cannot be unlocked with
        // it is rejected before the live vault is touched.
        await importBackup(parsed, passphrase || undefined);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Backup import failed.');
        return;
      }
      setError(null);

      // Re-unlock after import.
      const loaded = passphrase ? await unlockVault(passphrase) : null;
      if (loaded) {
        setVault(loaded);
        setIsUnlocked(true);
        setVaultPresent(true);
      } else {
        setVault(null);
        setIsUnlocked(false);
        setVaultPresent(vaultExists());
      }

      await audit('vault_imported', 'backup:import');
      // The imported audit log replaced the previous one; refresh the count so
      // the dashboard reflects the imported chain rather than the old total.
      if (passphrase && loaded) {
        await loadAuditCount(passphrase);
      }
    });
  }

  async function handleWipeAllData(): Promise<void> {
    await withBusy(async () => {
      try {
        await wipeAllData();
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'Unable to wipe local data.';
        setError(`Wipe failed — some data may remain on this device. ${message}`);
        return;
      }

      lockVault('All local data has been wiped from this device.');
      setVaultPresent(false);
    });
  }

  // Onboarding batch handlers: add everything in a single vault update so the
  // wizard cannot lose writes to stale closures, and return real counts so its
  // summary reflects what actually happened.
  async function handleOnboardingAddIdentifiers(
    items: { type: IdentifierType; value: string }[]
  ): Promise<number> {
    if (!vault || !persona) {
      return 0;
    }

    const result = await withBusy(async () => {
      setError(null);

      let next = vault;
      let added = 0;
      for (const item of items) {
        const validated = validateIdentifierInput(item.type, item.value);
        if (!validated.ok || !validated.normalizedType) {
          continue;
        }

        const local = next.identifiers.filter(
          (identifier) => (identifier.personaId ?? persona.id) === persona.id
        );
        if (hasDuplicateIdentifier(local, validated.normalizedType, validated.normalizedValue)) {
          continue;
        }

        if (!canAddIdentifier(next.identifiers, config.maxIdentifiers)) {
          break;
        }

        next = addIdentifier(next, {
          id: crypto.randomUUID(),
          personaId: persona.id,
          type: validated.normalizedType,
          value: validated.normalizedValue,
          sensitivity: validated.normalizedType === 'address' ? 3 : 2,
          consent: true,
          createdAt: nowIso()
        });
        added += 1;
      }

      if (added === 0) {
        return 0;
      }

      setVault(next);
      if (!(await persist(next))) {
        return 0;
      }

      await audit('identifier_added', `onboarding:${added}`);
      return added;
    });

    return result ?? 0;
  }

  async function handleOnboardingAddConnectors(connectorIds: string[]): Promise<number> {
    if (!vault || !persona) {
      return 0;
    }

    const result = await withBusy(async () => {
      setError(null);

      let next = vault;
      const added: string[] = [];
      for (const connectorId of connectorIds) {
        const def = getConnectorDefinition(connectorId, connectorCatalog);
        if (!def) {
          continue;
        }

        const exists = next.connectorInstances.some(
          (item) => item.personaId === persona.id && item.connectorId === connectorId
        );
        if (exists) {
          continue;
        }

        next = addConnectorInstance(next, {
          id: crypto.randomUUID(),
          connectorId,
          personaId: persona.id,
          state: 'discovered',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          evidence: []
        });
        added.push(connectorId);
      }

      if (added.length === 0) {
        return 0;
      }

      setVault(next);
      if (!(await persist(next))) {
        return 0;
      }

      await audit('connector_added', `onboarding:${added.join(',')}`);
      return added.length;
    });

    return result ?? 0;
  }

  function handleCompleteOnboarding(): void {
    setShowOnboarding(false);
  }

  async function handleUpgradeLegacyEvidence(): Promise<void> {
    if (!passphrase) {
      return;
    }

    await withBusy(async () => {
      setError(null);
      try {
        const result = await upgradeLegacyEvidence(passphrase);
        setLegacyEvidenceCount(await countLegacyEvidence());
        setNotice(
          result.failed > 0
            ? `Re-encrypted ${String(result.upgraded)} evidence file(s); ${String(result.failed)} could not be read with this passphrase.`
            : `Re-encrypted ${String(result.upgraded)} evidence file(s) under the current key derivation.`
        );
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Unable to re-encrypt evidence.');
      }
    });
  }

  const connectorInstances = vault && persona
    ? vault.connectorInstances.filter((item) => item.personaId === persona.id)
    : [];
  const due = dueConnectorInstances(connectorInstances);
  const backupStatus = backupFreshness(vault?.settings.lastBackupExportAt);

  return {
    // state
    tab,
    setTab,
    passphrase,
    setPassphrase,
    vault,
    persona,
    isUnlocked,
    vaultPresent,
    busy,
    notice,
    showOnboarding,
    error,
    auditError,
    auditCount,
    connectorCatalog,
    connectorCatalogMeta,
    accountsImportStatus,
    // derived
    personaIdentifiers,
    personaAccounts,
    exposureGraph,
    prioritizedFindings,
    manualSuggestions,
    connectorInstances,
    due,
    backupStatus,
    storageHealth,
    legacyEvidenceCount,
    remindersEnabled,
    remindersSupported: notificationsSupported(),
    // handlers
    handleEnableReminders,
    handleUnlock,
    handleLock,
    handleCreateVault,
    handleWipeAndRecreate,
    handleOnboardingAddIdentifiers,
    handleOnboardingAddConnectors,
    handleCompleteOnboarding,
    handleAddPersona,
    handleSetActivePersona,
    handleUpdateConnectorCatalog,
    handleImportConnectorCatalog,
    handleAddIdentifier,
    handleAddAccount,
    handleImportAccounts,
    handleImportMailbox,
    handleAddConnector,
    handleExportAgentJob,
    handleImportAgentResults,
    handleTransition,
    handleMarkRechecked,
    handleAddNoteEvidence,
    handleDeleteEvidence,
    handleUploadEvidence,
    handleDownloadEvidence,
    handleVerifyAudit,
    handleRunLocalScan,
    handleSetFindingStatus,
    handleSaveHibpApiKey,
    handleCheckPassword,
    handleExportReport,
    handleExportBackup,
    handleImportBackup,
    handleUpgradeLegacyEvidence,
    handleWipeAllData
  };
}
