import type { RiskFinding } from '../../core/types';

interface FindingsTabProps {
  findings: RiskFinding[];
}

export function FindingsTab({ findings }: FindingsTabProps): React.JSX.Element {
  return (
    <section>
      <h2>Findings</h2>
      <ol>
        {findings.map((finding) => (
          <li key={finding.id}>
            <strong>{finding.title}</strong>
            <p>{`Tier: ${finding.tier}, score: ${finding.harm}/${finding.exploitability}`}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
