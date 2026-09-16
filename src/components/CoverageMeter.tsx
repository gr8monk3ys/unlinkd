import type { CoverageSummary } from '../core/coverage';
import { STATE_REGISTRIES } from '../core/coverage';

export interface CoverageMeterProps {
  summary: CoverageSummary;
  onOpenConnectors?: () => void;
}

const TONE: Record<CoverageSummary['dropStatus'], string> = {
  none: '#b45309',
  submitted: '#0f766e',
  overdue: '#b45309',
  completed: '#0f766e'
};

/**
 * States the size of the problem alongside progress against it.
 *
 * A progress bar over the connectors a user happens to have added reads as
 * "almost done" while hundreds of registered brokers still hold their data.
 * The denominator here is the public registry, dated and linked, so the number
 * is checkable rather than reassuring.
 */
export function CoverageMeter(props: CoverageMeterProps): React.JSX.Element {
  const { summary, onOpenConnectors } = props;
  const { universe, dropStatus } = summary;

  return (
    <section
      aria-labelledby="coverage-heading"
      style={{ border: `1px solid ${TONE[dropStatus]}`, borderRadius: '6px', padding: '12px', marginBottom: '16px' }}
    >
      <h3 id="coverage-heading" style={{ marginTop: 0 }}>
        Broker coverage
      </h3>
      <p>{summary.headline}</p>

      {dropStatus === 'none' ? (
        <p>
          California residents can submit one verified deletion request through the state&apos;s Delete Request and
          Opt-out Platform, and every registered broker must act on it. It has been enforceable since 1 August 2026.
          {onOpenConnectors ? ' Add the California DROP connector to track it here.' : ''}
        </p>
      ) : null}

      <details style={{ fontSize: '0.85em', marginBottom: '8px' }}>
        <summary>Where else brokers must register</summary>
        <ul>
          {STATE_REGISTRIES.map((registry) => (
            <li key={registry.jurisdiction}>
              <strong>{registry.name}</strong>
              {` — ${registry.note}`}
            </li>
          ))}
        </ul>
        <p style={{ margin: '4px 0' }}>
          Outside these states, and across the EU and UK, there is no central platform: deletion is one request per
          operator. A registry is not the same as a remedy.
        </p>
      </details>

      <p style={{ fontSize: '0.85em', opacity: 0.85 }}>
        {`Denominator: ${universe.registryName}, ${String(universe.registeredBrokersAtLeast)}+ registered as of ${universe.asOf}. `}
        <a href={universe.sourceUrl} target="_blank" rel="noreferrer noopener">
          Check the registry
        </a>
        {'. Individual opt-outs in this catalog cover '}
        {String(summary.brokersInCatalog)}
        {' broker(s) — a small fraction of the registry, which is why the catalog alone is not a plan.'}
      </p>

      {onOpenConnectors ? (
        <button type="button" onClick={onOpenConnectors}>
          Open connectors
        </button>
      ) : null}
    </section>
  );
}
