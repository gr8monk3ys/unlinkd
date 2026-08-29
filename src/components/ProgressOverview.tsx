import { memo } from 'react';
import type {
  ConnectorDefinition,
  ConnectorInstance,
  ConnectorState,
  RiskFinding,
  ThreatTier
} from '../core/types';
import { connectorName } from '../core/connectors';

export interface ProgressOverviewProps {
  identifiersCount: number;
  accountsCount: number;
  connectorInstances: ConnectorInstance[];
  findings: RiskFinding[];
  connectorCatalog: ConnectorDefinition[];
  onMarkRechecked: (instanceId: string) => void;
}

const STATE_WEIGHT: Record<ConnectorState, number> = {
  discovered: 0,
  verified: 20,
  user_approved: 40,
  executed: 60,
  proof_captured: 80,
  recheck_scheduled: 100
};

function computeOverallProgress(instances: ConnectorInstance[]): number {
  if (instances.length === 0) {
    return 0;
  }

  const total = instances.reduce((sum, instance) => sum + STATE_WEIGHT[instance.state], 0);
  return Math.round(total / instances.length);
}

function countByTier(findings: RiskFinding[]): Record<ThreatTier, number> {
  const counts: Record<ThreatTier, number> = { low: 0, moderate: 0, high: 0 };
  for (const finding of findings) {
    counts[finding.tier] += 1;
  }
  return counts;
}

function dueRechecks(instances: ConnectorInstance[]): ConnectorInstance[] {
  const now = Date.now();
  return instances
    .filter((instance) => {
      if (!instance.nextCheckAt) {
        return false;
      }
      const ts = Date.parse(instance.nextCheckAt);
      return Number.isFinite(ts) && ts <= now;
    })
    .sort((a, b) => {
      const aTime = Date.parse(a.nextCheckAt ?? '');
      const bTime = Date.parse(b.nextCheckAt ?? '');
      return (Number.isFinite(aTime) ? aTime : 0) - (Number.isFinite(bTime) ? bTime : 0);
    });
}

function completedCount(instances: ConnectorInstance[]): number {
  return instances.filter((i) => i.state === 'recheck_scheduled').length;
}

const progressBarContainerStyle: React.CSSProperties = {
  width: '100%',
  height: '24px',
  backgroundColor: '#e0e0e0',
  borderRadius: '12px',
  overflow: 'hidden',
  position: 'relative'
};

const progressBarLabelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '12px',
  fontWeight: 600,
  color: '#333',
  pointerEvents: 'none'
};

const statsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: '12px',
  margin: '16px 0'
};

const statCardStyle: React.CSSProperties = {
  padding: '12px',
  border: '1px solid #ddd',
  borderRadius: '8px',
  textAlign: 'center'
};

const statValueStyle: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: 700,
  margin: 0
};

const statLabelStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#666',
  margin: '4px 0 0 0'
};

function ProgressOverviewInner(props: ProgressOverviewProps): React.JSX.Element {
  const {
    identifiersCount,
    accountsCount,
    connectorInstances,
    findings,
    connectorCatalog,
    onMarkRechecked
  } = props;

  const progress = computeOverallProgress(connectorInstances);
  const completed = completedCount(connectorInstances);
  const openFindings = findings.filter((f) => !f.status || f.status === 'open');
  const tierCounts = countByTier(openFindings);
  const due = dueRechecks(connectorInstances);

  const progressFillStyle: React.CSSProperties = {
    height: '100%',
    width: `${progress}%`,
    backgroundColor: progress === 100 ? '#4caf50' : progress >= 50 ? '#ff9800' : '#2196f3',
    borderRadius: '12px',
    transition: 'width 0.3s ease'
  };

  return (
    <section aria-label="Progress overview">
      <h3>Progress Overview</h3>

      {/* Overall progress bar */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>Overall Cleanup Progress</span>
          <span data-testid="progress-percentage" style={{ fontSize: '14px', fontWeight: 600 }}>{`${progress}%`}</span>
        </div>
        <div
          style={progressBarContainerStyle}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Overall cleanup progress: ${progress}%`}
        >
          <div style={progressFillStyle} />
          <div style={progressBarLabelStyle}>{`${progress}%`}</div>
        </div>
      </div>

      {/* Stats grid */}
      <div style={statsGridStyle}>
        <div style={statCardStyle}>
          <p style={statValueStyle} data-testid="stat-identifiers">{identifiersCount}</p>
          <p style={statLabelStyle}>Identifiers Tracked</p>
        </div>
        <div style={statCardStyle}>
          <p style={statValueStyle} data-testid="stat-accounts">{accountsCount}</p>
          <p style={statLabelStyle}>Accounts Cataloged</p>
        </div>
        <div style={statCardStyle}>
          <p style={statValueStyle} data-testid="stat-connectors">{`${completed} / ${connectorInstances.length}`}</p>
          <p style={statLabelStyle}>Connectors Complete</p>
        </div>
        <div style={statCardStyle}>
          <p style={statValueStyle} data-testid="stat-findings">{openFindings.length}</p>
          <p style={statLabelStyle}>
            {`Findings Open`}
            {openFindings.length > 0
              ? ` (${tierCounts.high}H / ${tierCounts.moderate}M / ${tierCounts.low}L)`
              : ''}
          </p>
        </div>
      </div>

      {/* Due actions */}
      {due.length > 0 ? (
        <section aria-label="Due rechecks">
          <h4>{`Due Actions (${due.length})`}</h4>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {due.map((instance) => (
              <li
                key={instance.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px',
                  borderBottom: '1px solid #eee'
                }}
              >
                <span>
                  {`${connectorName(instance.connectorId, connectorCatalog)} — due: ${instance.nextCheckAt ?? 'unknown'}`}
                </span>
                <button type="button" onClick={() => onMarkRechecked(instance.id)}>
                  Mark Rechecked
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

export const ProgressOverview = memo(ProgressOverviewInner);
