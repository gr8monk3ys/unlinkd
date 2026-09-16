import type { ConnectorDefinition, ConnectorInstance } from './types';
import { computeDeadline } from './compliance/deadlines';
import { instanceRequests } from './compliance/requests';

/**
 * How large the problem actually is.
 *
 * Showing a wall of green ticks against a 20-broker catalog tells a user they
 * are done when they are not: the registered broker population is in the
 * hundreds. The denominator here comes from a public registry rather than an
 * estimate, so the number can be checked and dated.
 */
export interface BrokerUniverse {
  /**
   * Conservative floor, not an exact count — registrations move through the
   * year and reporting quotes a range. Rendered as "500+" rather than "500".
   */
  registeredBrokersAtLeast: number;
  registryName: string;
  sourceUrl: string;
  /** YYYY-MM-DD the figure was last checked. */
  asOf: string;
}

export const CA_BROKER_REGISTRY: BrokerUniverse = {
  registeredBrokersAtLeast: 500,
  registryName: 'California data broker registry',
  sourceUrl: 'https://cppa.ca.gov/data_broker_registry/',
  asOf: '2026-08-28'
};

/**
 * Where else a broker must publicly register, and whether that registry comes
 * with a lever the consumer can actually pull.
 *
 * Only California pairs a registry with a central deletion portal. Texas and
 * Oregon give a deletion right but leave the consumer to contact each broker.
 * Vermont publishes who is operating and stops there — worth saying out loud,
 * because a registry is easily mistaken for a remedy.
 */
export interface StateRegistry {
  jurisdiction: string;
  name: string;
  /** A single request that reaches every registered broker. */
  centralDeletionPortal: boolean;
  /** A statutory deletion right, however it must be exercised. */
  deletionRight: boolean;
  note: string;
}

export const STATE_REGISTRIES: StateRegistry[] = [
  {
    jurisdiction: 'US-CA',
    name: 'California',
    centralDeletionPortal: true,
    deletionRight: true,
    note: 'DROP reaches every registered broker from one verified request; enforceable since 1 August 2026.'
  },
  {
    jurisdiction: 'US-TX',
    name: 'Texas',
    centralDeletionPortal: false,
    deletionRight: true,
    note: 'Registry and a deletion right, but no central portal — requests go to each broker individually.'
  },
  {
    jurisdiction: 'US-OR',
    name: 'Oregon',
    centralDeletionPortal: false,
    deletionRight: true,
    note: 'Registry and a deletion right, but no central portal — requests go to each broker individually.'
  },
  {
    jurisdiction: 'US-VT',
    name: 'Vermont',
    centralDeletionPortal: false,
    deletionRight: false,
    note: 'Registry only: you can see who is operating, but the statute gives no deletion lever.'
  },
  {
    jurisdiction: 'US-CT',
    name: 'Connecticut',
    centralDeletionPortal: false,
    deletionRight: true,
    note: 'Following the California model: registration from 1 January 2027, central deletion mechanism by 1 July 2028.'
  }
];

export type DropStatus = 'none' | 'submitted' | 'overdue' | 'completed';

export interface CoverageSummary {
  /** Brokers the user has individually worked to a captured-proof state. */
  brokersWithProof: number;
  /** Broker connectors the user has started at all. */
  brokersStarted: number;
  /** Broker connectors available to start in the loaded catalog. */
  brokersInCatalog: number;
  universe: BrokerUniverse;
  dropStatus: DropStatus;
  /** One honest sentence for the UI to lead with. */
  headline: string;
}

/** States in which a broker has been worked through and evidence captured. */
const PROVEN_STATES = new Set(['proof_captured', 'recheck_scheduled']);

/** The connector id that represents a California DROP submission. */
export const DROP_CONNECTOR_ID = 'ca-drop-deletion';

function dropStatusFor(instances: ConnectorInstance[], now: number): DropStatus {
  const dropInstances = instances.filter((instance) => instance.connectorId === DROP_CONNECTOR_ID);
  if (dropInstances.length === 0) {
    return 'none';
  }

  const computations = dropInstances.flatMap((instance) =>
    instanceRequests(instance).map((request) => computeDeadline(request, undefined, now))
  );

  if (computations.some((computation) => computation.status === 'closed')) {
    return 'completed';
  }
  if (computations.some((computation) => computation.status === 'overdue')) {
    return 'overdue';
  }
  // Added but with no request logged yet still counts as started, not done.
  return computations.length > 0 ? 'submitted' : 'none';
}

function headlineFor(summary: Omit<CoverageSummary, 'headline'>): string {
  const { brokersWithProof, universe, dropStatus } = summary;
  const registry = `${String(universe.registeredBrokersAtLeast)}+ registered brokers`;

  switch (dropStatus) {
    case 'completed':
      return `A California DROP deletion is confirmed, which reaches ${registry} — plus ${String(brokersWithProof)} verified individually.`;
    case 'overdue':
      return `Your California DROP request is past its deadline. It covers ${registry}, so chasing it is worth more than any single opt-out.`;
    case 'submitted':
      return `A California DROP request is running, covering ${registry}. ${String(brokersWithProof)} broker(s) verified individually so far.`;
    default:
      return `${String(brokersWithProof)} broker(s) verified out of ${registry}. Working through them one at a time will not close that gap — DROP covers the whole registry in one request.`;
  }
}

export function summarizeCoverage(
  instances: ConnectorInstance[],
  catalog: ConnectorDefinition[],
  now: number = Date.now()
): CoverageSummary {
  const brokerIds = new Set(
    catalog.filter((definition) => definition.category === 'broker').map((definition) => definition.id)
  );

  const brokerInstances = instances.filter((instance) => brokerIds.has(instance.connectorId));

  const base = {
    brokersWithProof: brokerInstances.filter((instance) => PROVEN_STATES.has(instance.state)).length,
    brokersStarted: brokerInstances.length,
    brokersInCatalog: brokerIds.size,
    universe: CA_BROKER_REGISTRY,
    dropStatus: dropStatusFor(instances, now)
  };

  return { ...base, headline: headlineFor(base) };
}
