import type {
  ConnectorDefinition,
  ConnectorInstance,
  ExposureEdge,
  ExposureNode,
  RiskFinding
} from '../../core/types';
import { connectorName } from '../../core/connectors';
import type { BackupFreshness } from '../../core/storage';
import { ExposureGraph } from '../ExposureGraph';
import { ProgressOverview } from '../ProgressOverview';

export interface DashboardTabProps {
  personaIdentifiersCount: number;
  personaAccountsCount: number;
  connectorCatalog: ConnectorDefinition[];
  dueConnectors: ConnectorInstance[];
  remindersSupported: boolean;
  remindersEnabled: boolean;
  onEnableReminders: () => void;
  auditCount: number;
  auditError: string | null;
  onMarkRechecked: (instanceId: string) => void;
  onRunLocalScan: () => void;
  onVerifyAudit: () => void;
  exposureNodes?: ExposureNode[];
  exposureEdges?: ExposureEdge[];
  connectorInstances?: ConnectorInstance[];
  findings?: RiskFinding[];
  personaName?: string;
  backupStatus?: BackupFreshness;
  onGoToBackup?: () => void;
}

function fmtDue(value: string | undefined): string {
  if (!value) return 'unknown';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : value;
}

export function DashboardTab(props: DashboardTabProps): React.JSX.Element {
  const {
    personaIdentifiersCount,
    personaAccountsCount,
    connectorCatalog,
    dueConnectors,
    remindersSupported,
    remindersEnabled,
    onEnableReminders,
    auditCount,
    auditError,
    onMarkRechecked,
    onRunLocalScan,
    onVerifyAudit,
    exposureNodes,
    exposureEdges,
    connectorInstances,
    findings,
    personaName,
    backupStatus,
    onGoToBackup
  } = props;

  return (
    <section>
      <h2>Dashboard</h2>

      {backupStatus?.overdue ? (
        <section
          aria-labelledby="backup-due-heading"
          style={{ border: '1px solid #b45309', borderRadius: '6px', padding: '12px', marginBottom: '16px' }}
        >
          <h3 id="backup-due-heading" style={{ marginTop: 0 }}>
            {backupStatus.never ? '⚠ No backup yet' : '⚠ Backup is out of date'}
          </h3>
          <p>
            {backupStatus.never
              ? 'Nothing here can be recovered if this browser’s storage is cleared. Export an encrypted backup.'
              : `Your last backup was ${String(backupStatus.ageDays)} days ago. Anything added since then would be lost.`}
          </p>
          {onGoToBackup ? (
            <button type="button" className="btn-primary" onClick={onGoToBackup}>
              Go to Backup
            </button>
          ) : null}
        </section>
      ) : null}

      {dueConnectors.length > 0 ? (
        <section
          aria-labelledby="rechecks-due-heading"
          style={{ border: '1px solid #b45309', borderRadius: '6px', padding: '12px', marginBottom: '16px' }}
        >
          <h3 id="rechecks-due-heading" style={{ marginTop: 0 }}>
            {`⏰ ${dueConnectors.length} ${dueConnectors.length === 1 ? 'recheck is' : 'rechecks are'} due`}
          </h3>
          <p>Data brokers re-list you over time — re-verify these and capture fresh evidence.</p>
          <ul>
            {dueConnectors.map((instance) => (
              <li key={instance.id} style={{ marginBottom: '4px' }}>
                {`${connectorName(instance.connectorId, connectorCatalog)} — due ${fmtDue(instance.nextCheckAt)} `}
                <button type="button" onClick={() => onMarkRechecked(instance.id)}>
                  Mark rechecked
                </button>
              </li>
            ))}
          </ul>
          {remindersSupported && !remindersEnabled ? (
            <button type="button" onClick={() => onEnableReminders()}>
              Enable desktop reminders
            </button>
          ) : null}
          {remindersEnabled ? <p role="status">Desktop reminders enabled.</p> : null}
        </section>
      ) : null}

      <ProgressOverview
        identifiersCount={personaIdentifiersCount}
        accountsCount={personaAccountsCount}
        connectorInstances={connectorInstances ?? []}
        findings={findings ?? []}
        connectorCatalog={connectorCatalog}
        onMarkRechecked={onMarkRechecked}
      />

      <ExposureGraph
        nodes={exposureNodes ?? []}
        edges={exposureEdges ?? []}
        personaName={personaName ?? 'Persona'}
      />

      <div style={{ marginTop: '16px' }}>
        <button type="button" onClick={() => onRunLocalScan()}>
          Run Local Scan
        </button>
      </div>

      <section>
        <h3>Audit</h3>
        <p>{`Entries: ${auditCount}`}</p>
        <button type="button" onClick={() => onVerifyAudit()}>
          Verify Audit Chain
        </button>
        {auditError ? <p role="status">{auditError}</p> : null}
      </section>
    </section>
  );
}
