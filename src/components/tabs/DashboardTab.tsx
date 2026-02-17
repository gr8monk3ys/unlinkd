import type {
  ConnectorDefinition,
  ConnectorInstance,
  ExposureEdge,
  ExposureNode,
  RiskFinding
} from '../../core/types';
import { ExposureGraph } from '../ExposureGraph';
import { ProgressOverview } from '../ProgressOverview';

export interface DashboardTabProps {
  /* Existing props (backward compatible) */
  personaIdentifiersCount: number;
  personaAccountsCount: number;
  graphNodes: number;
  graphEdges: number;
  connectorInstancesCount: number;
  dueConnectors: ConnectorInstance[];
  connectorCatalog: ConnectorDefinition[];
  auditCount: number;
  auditError: string | null;
  onMarkRechecked: (instanceId: string) => void;
  onRunLocalScan: () => void;
  onVerifyAudit: () => void;

  /* New optional props for visual components */
  exposureNodes?: ExposureNode[];
  exposureEdges?: ExposureEdge[];
  connectorInstances?: ConnectorInstance[];
  findings?: RiskFinding[];
  personaName?: string;
}

export function DashboardTab(props: DashboardTabProps): React.JSX.Element {
  const {
    personaIdentifiersCount,
    personaAccountsCount,
    connectorCatalog,
    auditCount,
    auditError,
    onMarkRechecked,
    onRunLocalScan,
    onVerifyAudit,
    exposureNodes,
    exposureEdges,
    connectorInstances,
    findings,
    personaName
  } = props;

  return (
    <section>
      <h2>Dashboard</h2>

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
