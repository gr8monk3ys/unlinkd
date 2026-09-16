import type { ConnectorDefinition } from '../core/types';
import { connectorName } from '../core/connectors';
import type { TrackedRequest } from '../core/compliance/deadlines';
import { requestChannelLabels } from '../core/compliance/requests';

export interface RequestWorklistProps {
  tracked: TrackedRequest[];
  connectorCatalog: ConnectorDefinition[];
  onOpenConnectors?: () => void;
}

function overdueLabel(daysRemaining: number): string {
  const overdueBy = Math.abs(daysRemaining);
  return `${String(overdueBy)} ${overdueBy === 1 ? 'day' : 'days'} overdue`;
}

function dueSoonLabel(daysRemaining: number): string {
  if (daysRemaining === 0) {
    return 'due today';
  }
  return `due in ${String(daysRemaining)} ${daysRemaining === 1 ? 'day' : 'days'}`;
}

/**
 * The requests a user should act on, worst first.
 *
 * Every deadline is shown with the citation it comes from and the arithmetic
 * behind it: a legal date the user cannot check is a date they should not rely
 * on.
 */
export function RequestWorklist(props: RequestWorklistProps): React.JSX.Element | null {
  const { tracked, connectorCatalog, onOpenConnectors } = props;

  if (tracked.length === 0) {
    return null;
  }

  const overdueCount = tracked.filter((item) => item.computation.status === 'overdue').length;

  return (
    <section
      aria-labelledby="requests-attention-heading"
      style={{ border: '1px solid #b45309', borderRadius: '6px', padding: '12px', marginBottom: '16px' }}
    >
      <h3 id="requests-attention-heading" style={{ marginTop: 0 }}>
        {overdueCount > 0
          ? `⚠ ${String(overdueCount)} ${overdueCount === 1 ? 'request is' : 'requests are'} past the legal deadline`
          : `⏳ ${String(tracked.length)} ${tracked.length === 1 ? 'request is' : 'requests are'} approaching their deadline`}
      </h3>
      <p>
        An operator that misses its statutory deadline is the point at which you can escalate to a regulator. Keep
        the evidence attached to each request.
      </p>
      <ul>
        {tracked.map(({ instance, request, computation }) => {
          const name = connectorName(instance.connectorId, connectorCatalog);
          const days = computation.daysRemaining ?? 0;
          const label = computation.status === 'overdue' ? overdueLabel(days) : dueSoonLabel(days);

          return (
            <li key={request.id} style={{ marginBottom: '8px' }}>
              <strong>{name}</strong>
              {` — ${label}`}
              {computation.dueAt ? ` (due ${computation.dueAt})` : ''}
              <div style={{ fontSize: '0.85em', opacity: 0.85 }}>
                {computation.basis ? `${computation.basis.label} · ${computation.basis.citation}` : 'Unknown basis'}
                {` · sent by ${requestChannelLabels[request.channel]}`}
                {computation.extended ? ' · extension claimed' : ''}
                {computation.overridden ? ' · deadline set manually' : ''}
              </div>
              <details style={{ fontSize: '0.85em' }}>
                <summary>How this date was worked out</summary>
                <p style={{ margin: '4px 0' }}>{computation.explanation}</p>
                {computation.stale ? (
                  <p style={{ margin: '4px 0' }} role="status">
                    ⚠ This deadline comes from a compliance profile that is past its review date — treat it as
                    unverified and check the statute before relying on it.
                  </p>
                ) : null}
              </details>
            </li>
          );
        })}
      </ul>
      <p style={{ fontSize: '0.85em', opacity: 0.85 }}>
        Deadlines are informational, not legal advice. Confirm the window that applies to you before escalating.
      </p>
      {onOpenConnectors ? (
        <button type="button" onClick={onOpenConnectors}>
          Open connectors
        </button>
      ) : null}
    </section>
  );
}
