import { useState, useMemo } from 'react';
import type {
  ConnectorDefinition,
  ConnectorInstance,
  ConnectorState,
  ConnectorCategory,
  EvidenceKind,
  EvidenceMeta
} from '../../core/types';
import { getConnectorDefinition, type ConnectorCatalogMeta } from '../../connectors/catalog';
import {
  CONNECTOR_REVIEW_CADENCE_DAYS,
  connectorName,
  connectorReviewAgeDays,
  isConnectorStale
} from '../../core/connectors';
import { nextStates } from '../../core/workflow';

export type { ConnectorCatalogMeta };

interface ConnectorsTabProps {
  connectorCatalog: ConnectorDefinition[];
  connectorCatalogMeta: ConnectorCatalogMeta;
  connectorInstances: ConnectorInstance[];
  onUpdateCatalog: () => void;
  onImportCatalog: (file: File) => void;
  onImportAgentResults: (file: File) => void;
  onAddConnector: (def: ConnectorDefinition) => void;
  onExportAgentJob: (instanceId: string) => void;
  onTransition: (instanceId: string, to: ConnectorState) => void;
  onAddNoteEvidence: (instanceId: string, body: string, label: string) => Promise<boolean>;
  onDeleteEvidence: (instanceId: string, evidenceId: string) => void;
  onUploadEvidence: (instanceId: string, file: File, kind: EvidenceKind, label: string) => Promise<boolean>;
  onDownloadEvidence: (meta: EvidenceMeta) => void;
}

type CategoryFilter = 'all' | ConnectorCategory;

const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  all: 'All',
  account: 'Accounts',
  broker: 'Brokers',
  search: 'Search',
  other: 'Other'
};

const CATEGORY_ORDER: CategoryFilter[] = ['all', 'account', 'broker', 'search', 'other'];

const STATE_LABELS: Record<ConnectorState, string> = {
  discovered: 'Discovered',
  verified: 'Verified',
  user_approved: 'User Approved',
  executed: 'Executed',
  proof_captured: 'Proof Captured',
  recheck_scheduled: 'Recheck Scheduled'
};

const STATE_ORDER: ConnectorState[] = [
  'discovered',
  'verified',
  'user_approved',
  'executed',
  'proof_captured',
  'recheck_scheduled'
];

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}

/** Warns that a connector's steps may no longer match the provider's real flow. */
function StalenessBadge({ def }: { def: ConnectorDefinition }): React.JSX.Element | null {
  if (!isConnectorStale(def)) {
    return null;
  }

  const age = connectorReviewAgeDays(def);
  const label =
    age === null
      ? 'Steps carry no review date — verify against the provider before relying on them.'
      : `Steps last reviewed ${String(age)} days ago (cadence is ${String(CONNECTOR_REVIEW_CADENCE_DAYS)}); the provider may have changed its flow since.`;

  return (
    <span
      title={label}
      style={{ color: 'var(--accent-amber)', fontSize: '0.8em', flexShrink: 0 }}
    >
      {'⚠ unverified'}
    </span>
  );
}

function StepChecklist({
  def,
  instance
}: {
  def: ConnectorDefinition;
  instance: ConnectorInstance;
}): React.JSX.Element {
  return (
    <div style={{ marginTop: '4px', marginBottom: '4px' }}>
      <p style={{ margin: '2px 0', fontSize: '0.85em', color: 'var(--text-secondary)' }}>
        {`${def.steps.length} step${def.steps.length === 1 ? '' : 's'} · ${instance.evidence.length} evidence item${instance.evidence.length === 1 ? '' : 's'} attached`}
      </p>
      <ol style={{ margin: '4px 0', paddingLeft: '1.5em', fontSize: '0.9em' }}>
        {def.steps.map((step) => (
          <li key={step.id} style={{ marginBottom: '2px' }}>
            <span>
              <strong>{step.title}</strong>
            </span>
            {step.type === 'manual' ? (
              <span style={{ color: 'var(--text-muted)', marginLeft: '8px', fontSize: '0.85em' }}>
                {truncate(step.instructions, 80)}
              </span>
            ) : (
              <span style={{ color: 'var(--text-muted)', marginLeft: '8px', fontSize: '0.85em' }}>
                {`Agent: ${step.action.kind}`}
              </span>
            )}
            {step.evidenceHint ? (
              <span style={{ color: 'var(--text-muted)', marginLeft: '8px', fontSize: '0.8em', fontStyle: 'italic' }}>
                {`(${step.evidenceHint})`}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function InstanceCard({
  instance,
  def,
  catalog,
  onExportAgentJob,
  onTransition,
  onAddNoteEvidence,
  onDeleteEvidence,
  onUploadEvidence,
  onDownloadEvidence
}: {
  instance: ConnectorInstance;
  def: ConnectorDefinition | null;
  catalog: ConnectorDefinition[];
  onExportAgentJob: (instanceId: string) => void;
  onTransition: (instanceId: string, to: ConnectorState) => void;
  onAddNoteEvidence: (instanceId: string, body: string, label: string) => Promise<boolean>;
  onDeleteEvidence: (instanceId: string, evidenceId: string) => void;
  onUploadEvidence: (instanceId: string, file: File, kind: EvidenceKind, label: string) => Promise<boolean>;
  onDownloadEvidence: (meta: EvidenceMeta) => void;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  // Evidence form state is per-card: sharing it across cards attached notes to
  // the wrong connector when more than one card was expanded.
  const [evidenceKind, setEvidenceKind] = useState<EvidenceKind>('file');
  const [evidenceLabel, setEvidenceLabel] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const allowed = nextStates(instance.state);

  return (
    <li>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8em' }}>{expanded ? '▼' : '▶'}</span>
        <strong>{connectorName(instance.connectorId, catalog)}</strong>
        {def ? (
          <span style={{ fontSize: '0.8em', color: 'var(--text-muted)' }}>
            {`(${def.steps.length} steps, ${instance.evidence.length} evidence)`}
          </span>
        ) : null}
        {def ? <StalenessBadge def={def} /> : null}
        <span style={{ marginLeft: 'auto', fontSize: '0.85em', color: 'var(--text-secondary)' }}>
          {instance.state}
        </span>
      </div>

      {expanded ? (
        <div style={{ marginTop: '8px', paddingLeft: '16px' }}>
          {instance.nextCheckAt ? <p style={{ margin: '2px 0', fontSize: '0.85em' }}>{`Next check: ${instance.nextCheckAt}`}</p> : null}

          {def && def.steps.some((step) => step.type === 'agent') ? (
            <button type="button" onClick={() => onExportAgentJob(instance.id)}>
              Export Agent Job
            </button>
          ) : null}

          {allowed.length > 0 ? (
            <div style={{ margin: '4px 0' }}>
              {allowed.map((state) => (
                <button
                  key={state}
                  type="button"
                  onClick={() => onTransition(instance.id, state)}
                  style={{ marginRight: '4px' }}
                >
                  {`Move → ${state}`}
                </button>
              ))}
            </div>
          ) : null}

          {def ? <StepChecklist def={def} instance={instance} /> : null}

          <section>
            <h4 style={{ margin: '8px 0 4px 0' }}>Evidence</h4>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              {/*
                Explicit htmlFor/id rather than wrapping the control: a <label>
                that wraps a <select> folds every option into the control's
                accessible name ("Kind file screenshot pdf email note").
              */}
              <div>
                <label htmlFor={`evidence-kind-${instance.id}`}>Kind</label>
                <select
                  id={`evidence-kind-${instance.id}`}
                  value={evidenceKind}
                  onChange={(event) => setEvidenceKind(event.target.value as EvidenceKind)}
                >
                  <option value="file">file</option>
                  <option value="screenshot">screenshot</option>
                  <option value="pdf">pdf</option>
                  <option value="email">email</option>
                  <option value="note">note</option>
                </select>
              </div>
              <div>
                <label htmlFor={`evidence-label-${instance.id}`}>Label</label>
                <input
                  id={`evidence-label-${instance.id}`}
                  value={evidenceLabel}
                  onChange={(event) => setEvidenceLabel(event.target.value)}
                  placeholder="optional label"
                />
              </div>
            </div>
            {evidenceKind === 'note' ? (
              <div style={{ marginTop: '4px' }}>
                <label htmlFor={`note-body-${instance.id}`}>Note</label>
                <textarea
                  id={`note-body-${instance.id}`}
                  value={noteBody}
                  onChange={(event) => setNoteBody(event.target.value)}
                  placeholder="enter note"
                  style={{ display: 'block', width: '100%', minHeight: '60px' }}
                />
                <button
                  type="button"
                  onClick={() =>
                    void onAddNoteEvidence(instance.id, noteBody, evidenceLabel).then((ok) => {
                      if (ok) {
                        setEvidenceLabel('');
                        setNoteBody('');
                      }
                    })
                  }
                >
                  Add Note Evidence
                </button>
              </div>
            ) : (
              <input
                type="file"
                style={{ marginTop: '4px' }}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  // Reset so selecting the same file again re-fires the change event.
                  event.target.value = '';
                  if (file) {
                    void onUploadEvidence(instance.id, file, evidenceKind, evidenceLabel).then((ok) => {
                      if (ok) {
                        setEvidenceLabel('');
                      }
                    });
                  }
                }}
              />
            )}
            {instance.evidence.length > 0 ? (
              <ul style={{ margin: '4px 0', paddingLeft: '1.2em' }}>
                {instance.evidence.map((meta) => (
                  <li key={meta.id} style={{ marginBottom: '2px', fontSize: '0.9em' }}>
                    <button type="button" onClick={() => onDownloadEvidence(meta)}>
                      {`Download: ${meta.filename}`}
                    </button>
                    <button type="button" onClick={() => onDeleteEvidence(instance.id, meta.id)} style={{ marginLeft: '4px' }}>
                      Delete
                    </button>
                    <span>{` [${meta.kind}]`}</span>
                    {meta.label ? <span>{` (${meta.label})`}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: '4px 0', fontSize: '0.85em', color: 'var(--text-muted)' }}>No evidence yet.</p>
            )}
          </section>
        </div>
      ) : null}
    </li>
  );
}

export function ConnectorsTab(props: ConnectorsTabProps): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');

  // Compute category counts from the full catalog (unfiltered)
  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryFilter, number> = {
      all: props.connectorCatalog.length,
      account: 0,
      broker: 0,
      search: 0,
      other: 0
    };
    for (const def of props.connectorCatalog) {
      if (def.category in counts) {
        counts[def.category as ConnectorCategory]++;
      }
    }
    return counts;
  }, [props.connectorCatalog]);

  // Filter and sort catalog connectors
  const filteredCatalog = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return props.connectorCatalog
      .filter((def) => {
        // Category filter
        if (activeCategory !== 'all' && def.category !== activeCategory) return false;
        // Search filter
        if (query) {
          const nameMatch = def.name.toLowerCase().includes(query);
          const descMatch = def.description.toLowerCase().includes(query);
          return nameMatch || descMatch;
        }
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [props.connectorCatalog, searchQuery, activeCategory]);

  const staleCount = useMemo(
    () => props.connectorCatalog.filter((def) => isConnectorStale(def)).length,
    [props.connectorCatalog]
  );

  // Group instances by state
  const instancesByState = useMemo(() => {
    const groups: Record<ConnectorState, ConnectorInstance[]> = {
      discovered: [],
      verified: [],
      user_approved: [],
      executed: [],
      proof_captured: [],
      recheck_scheduled: []
    };
    for (const instance of props.connectorInstances) {
      if (instance.state in groups) {
        groups[instance.state].push(instance);
      }
    }
    return groups;
  }, [props.connectorInstances]);

  return (
    <section>
      <h2>Connectors</h2>

      {/* ── Catalog Meta ── */}
      <h3>Catalog</h3>
      <p>{`Catalog version: ${props.connectorCatalogMeta.catalogVersion} (${props.connectorCatalogMeta.source})`}</p>
      {props.connectorCatalogMeta.generatedAt ? <p>{`Generated: ${props.connectorCatalogMeta.generatedAt}`}</p> : null}
      {props.connectorCatalogMeta.updatedAt ? <p>{`Updated: ${props.connectorCatalogMeta.updatedAt}`}</p> : null}
      <p>{`Signature verified: ${
        props.connectorCatalogMeta.verified === null ? 'unknown' : props.connectorCatalogMeta.verified ? 'yes' : 'no'
      }`}</p>
      {staleCount > 0 ? (
        <p role="status">
          {`${String(staleCount)} of ${String(props.connectorCatalog.length)} connectors have not been reviewed within ${String(CONNECTOR_REVIEW_CADENCE_DAYS)} days. Their steps may no longer match the provider — update the catalog, and verify before relying on them.`}
        </p>
      ) : null}
      <button type="button" onClick={() => props.onUpdateCatalog()}>
        Update Catalog
      </button>
      <label>
        Import Connector Pack (JSON)
        <input
          type="file"
          accept="application/json"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = '';
            if (file) {
              props.onImportCatalog(file);
            }
          }}
        />
      </label>
      {props.connectorCatalogMeta.error ? <p role="alert">{props.connectorCatalogMeta.error}</p> : null}

      {/* ── Agent ── */}
      <h3>Agent</h3>
      <label>
        Import Agent Results (JSON)
        <input
          type="file"
          accept="application/json"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = '';
            if (file) {
              props.onImportAgentResults(file);
            }
          }}
        />
      </label>

      {/* ── Search and Filter ── */}
      <fieldset style={{ border: '1px solid var(--border-default)', borderRadius: '4px', padding: '8px 12px', marginTop: '12px' }}>
        <legend>Browse Connectors</legend>

        <div style={{ marginBottom: '8px' }}>
          <label htmlFor="connector-search">
            Search:{' '}
            <input
              id="connector-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by name or description..."
              style={{ width: '280px' }}
            />
          </label>
        </div>

        <nav aria-label="Connector category filter" style={{ marginBottom: '8px' }}>
          {CATEGORY_ORDER.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              aria-pressed={activeCategory === cat}
              style={{
                marginRight: '4px',
                fontWeight: activeCategory === cat ? 'bold' : 'normal',
                textDecoration: activeCategory === cat ? 'underline' : 'none'
              }}
            >
              {`${CATEGORY_LABELS[cat]} (${categoryCounts[cat]})`}
            </button>
          ))}
        </nav>

        <p style={{ fontSize: '0.85em', color: 'var(--text-secondary)', margin: '4px 0 8px 0' }}>
          {`Showing ${filteredCatalog.length} of ${props.connectorCatalog.length} connectors`}
        </p>

        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {filteredCatalog.map((def) => (
            <li
              key={def.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 6px'
              }}
            >
              <strong style={{ minWidth: '220px', flexShrink: 0 }}>{def.name}</strong>
              <span
                style={{
                  flex: 1,
                  color: 'var(--text-secondary)',
                  fontSize: '0.9em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
                title={def.description}
              >
                {def.description}
              </span>
              <StalenessBadge def={def} />
              <button
                type="button"
                onClick={() => props.onAddConnector(def)}
                style={{ flexShrink: 0 }}
              >
                Add To Persona
              </button>
            </li>
          ))}
        </ul>

        {filteredCatalog.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '12px' }}>
            No connectors match your search.
          </p>
        ) : null}
      </fieldset>

      {/* ── My Connectors ── */}
      <h3 style={{ marginTop: '16px' }}>My Connectors</h3>
      {props.connectorInstances.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No connector instances yet. Add connectors from the catalog above.</p>
      ) : (
        STATE_ORDER.map((state) => {
          const instances = instancesByState[state];
          if (instances.length === 0) return null;
          return (
            <section key={state} style={{ marginBottom: '12px' }}>
              <h4 style={{ margin: '8px 0 4px 0', borderBottom: '1px solid var(--border-default)', paddingBottom: '2px' }}>
                {`${STATE_LABELS[state]} (${instances.length})`}
              </h4>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {instances.map((instance) => {
                  const def = getConnectorDefinition(instance.connectorId, props.connectorCatalog);
                  return (
                    <InstanceCard
                      key={instance.id}
                      instance={instance}
                      def={def}
                      catalog={props.connectorCatalog}
                      onExportAgentJob={props.onExportAgentJob}
                      onTransition={props.onTransition}
                      onAddNoteEvidence={props.onAddNoteEvidence}
                      onDeleteEvidence={props.onDeleteEvidence}
                      onUploadEvidence={props.onUploadEvidence}
                      onDownloadEvidence={props.onDownloadEvidence}
                    />
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </section>
  );
}
