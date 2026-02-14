import { useMemo, useRef, useState } from 'react';
import { appendAuditRecord, loadAuditRecords, verifyAuditChain } from '../core/audit';
import { getAppConfig } from '../core/config';
import { buildExposureGraph } from '../core/graph';
import { canAddIdentifier, hasDuplicateIdentifier } from '../core/policy';
import { sortFindingsByPriority } from '../core/scoring';
import { loadIdentifiers, saveIdentifiers } from '../core/storage';
import type { Identifier, IdentifierType, RiskFinding } from '../core/types';
import { validateIdentifierInput } from '../core/validation';

const identifierTypes: IdentifierType[] = ['email', 'phone', 'username', 'address', 'legal_name', 'device'];
const config = getAppConfig();

const seedFindings: RiskFinding[] = [
  { id: 'f-1', title: 'Address + phone exposed together', harm: 9, exploitability: 8, tier: 'high' },
  { id: 'f-2', title: 'Legacy email in breach corpus', harm: 7, exploitability: 7, tier: 'moderate' },
  { id: 'f-3', title: 'Username reused across accounts', harm: 6, exploitability: 6, tier: 'moderate' }
];

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('');
}

function createIdentifier(type: IdentifierType, value: string): Identifier {
  return {
    id: crypto.randomUUID(),
    type,
    value,
    sensitivity: type === 'address' ? 3 : 2,
    consent: true
  };
}

export function App(): React.JSX.Element {
  const busyRef = useRef(false);
  const [isBusy, setIsBusy] = useState(false);
  const [type, setType] = useState<IdentifierType>('email');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [identifiers, setIdentifiers] = useState<Identifier[]>([]);
  const [auditCount, setAuditCount] = useState<number>(0);

  const graph = useMemo(() => buildExposureGraph(identifiers), [identifiers]);
  const prioritizedFindings = useMemo(() => sortFindingsByPriority(seedFindings), []);

  async function unlockVault(): Promise<void> {
    if (busyRef.current) {
      return;
    }

    busyRef.current = true;
    setIsBusy(true);

    try {
      if (!passphrase) {
        setError('Passphrase is required to unlock storage.');
        return;
      }

      const loaded = await loadIdentifiers(config.retentionDays, passphrase);
      if (loaded === null) {
        setError('Unable to unlock storage with the provided passphrase.');
        return;
      }

      setIdentifiers(loaded);
      setIsUnlocked(true);
      setError(null);

      const auditRecords = await loadAuditRecords(passphrase);
      if (auditRecords === null) {
        setAuditError('Unable to unlock audit log with the provided passphrase.');
      } else {
        setAuditCount(auditRecords.length);
        setAuditError(null);
      }
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  }

  async function addIdentifier(): Promise<void> {
    if (busyRef.current) {
      return;
    }

    busyRef.current = true;
    setIsBusy(true);

    try {
      if (!isUnlocked) {
        setError('Unlock storage before adding identifiers.');
        return;
      }

      const result = validateIdentifierInput(type, value);
      if (!result.ok || !result.normalizedType) {
        setError(result.error);
        const record = await appendAuditRecord('identifier_rejected', result.error ?? 'invalid input', passphrase);
        if (!record) {
          setAuditError('Unable to write audit record.');
        } else {
          setAuditCount((count) => count + 1);
          setAuditError(null);
        }
        return;
      }

      if (hasDuplicateIdentifier(identifiers, result.normalizedType, result.normalizedValue)) {
        setError('This identifier already exists.');
        const record = await appendAuditRecord('identifier_rejected', 'duplicate identifier', passphrase);
        if (!record) {
          setAuditError('Unable to write audit record.');
        } else {
          setAuditCount((count) => count + 1);
          setAuditError(null);
        }
        return;
      }

      if (!canAddIdentifier(identifiers, config.maxIdentifiers)) {
        setError(`Identifier limit reached (${config.maxIdentifiers}).`);
        const record = await appendAuditRecord('identifier_rejected', 'identifier limit reached', passphrase);
        if (!record) {
          setAuditError('Unable to write audit record.');
        } else {
          setAuditCount((count) => count + 1);
          setAuditError(null);
        }
        return;
      }

      const next = [...identifiers, createIdentifier(result.normalizedType, result.normalizedValue)];

      try {
        await saveIdentifiers(next, passphrase);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'Unable to persist identifiers.';
        setError(message);
        return;
      }

      setIdentifiers(next);
      setValue('');
      setError(null);

      const fingerprint = await sha256Hex(`${result.normalizedType}:${result.normalizedValue}`);
      const record = await appendAuditRecord(
        'identifier_added',
        `${result.normalizedType}:${fingerprint}`,
        passphrase
      );
      if (!record) {
        setAuditError('Unable to write audit record.');
      } else {
        setAuditCount((count) => count + 1);
        setAuditError(null);
      }
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  }

  async function handleVerifyAuditChain(): Promise<void> {
    if (!isUnlocked) {
      setAuditError('Unlock storage before verifying the audit chain.');
      return;
    }

    const isValid = await verifyAuditChain(passphrase);
    setAuditError(isValid ? null : 'Audit chain verification failed.');
  }

  return (
    <main>
      <h1>unlinkd MVP</h1>
      <p>Local-first identifier intake and exposure modeling.</p>
      <section>
        <h2>Storage Unlock</h2>
        <label htmlFor="vault-passphrase">Passphrase</label>
        <input
          id="vault-passphrase"
          type="password"
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          placeholder="enter passphrase"
        />
        <button type="button" onClick={() => void unlockVault()} disabled={isBusy}>
          Unlock Storage
        </button>
        <p>{isUnlocked ? 'Storage unlocked' : 'Storage locked'}</p>
      </section>
      <section>
        <h2>Identifier Ingestion</h2>
        <label htmlFor="identifier-type">Type</label>
        <select id="identifier-type" value={type} onChange={(event) => setType(event.target.value as IdentifierType)}>
          {identifierTypes.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <label htmlFor="identifier-value">Value</label>
        <input
          id="identifier-value"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="enter identifier"
        />
        <button type="button" onClick={() => void addIdentifier()} disabled={isBusy}>
          Add Identifier
        </button>
        {error ? <p role="alert">{error}</p> : null}
        <ul>
          {identifiers.map((identifier) => (
            <li key={identifier.id}>{`${identifier.type}: ${identifier.value}`}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Exposure Graph Summary</h2>
        <p>{`Nodes: ${graph.nodes.length}`}</p>
        <p>{`Edges: ${graph.edges.length}`}</p>
      </section>
      <section>
        <h2>Audit Trail</h2>
        <p>{`Entries: ${auditCount}`}</p>
        <button type="button" onClick={() => void handleVerifyAuditChain()} disabled={isBusy}>
          Verify Audit Chain
        </button>
        {auditError ? <p role="status">{auditError}</p> : null}
      </section>
      <section>
        <h2>Prioritized Findings</h2>
        <ol>
          {prioritizedFindings.map((finding) => (
            <li key={finding.id}>{finding.title}</li>
          ))}
        </ol>
      </section>
    </main>
  );
}
