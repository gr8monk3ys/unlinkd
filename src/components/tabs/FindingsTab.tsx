import type { RiskFinding } from '../../core/types';
import { findingStatuses, type FindingStatus } from '../../core/findings';
import { scoreFinding } from '../../core/scoring';

interface FindingsTabProps {
  findings: RiskFinding[];
  onSetStatus: (id: string, status: FindingStatus) => void;
}

const statusLabels: Record<FindingStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  mitigated: 'Mitigated'
};

export function FindingsTab({ findings, onSetStatus }: FindingsTabProps): React.JSX.Element {
  return (
    <section>
      <h2>Findings</h2>
      {findings.length === 0 ? (
        <p>No findings yet. Run a scan from the Dashboard to generate findings.</p>
      ) : (
        <p>
          The priority score is a fixed severity ordering per finding type — it ranks what to handle
          first, and is not an estimate of your personal risk.
        </p>
      )}
      <ol>
        {findings.map((finding) => {
          const status = finding.status ?? 'open';
          return (
            <li key={finding.id}>
              <strong>{finding.title}</strong>
              <p>
                {`Tier: ${finding.tier} · priority score: ${scoreFinding(finding)} · status: ${statusLabels[status]}`}
              </p>
              <div role="group" aria-label={`Set status for ${finding.title}`}>
                {findingStatuses.map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    aria-pressed={status === candidate}
                    disabled={status === candidate}
                    onClick={() => onSetStatus(finding.id, candidate)}
                  >
                    {statusLabels[candidate]}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
