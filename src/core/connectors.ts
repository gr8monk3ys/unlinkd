import type { ConnectorDefinition, ConnectorInstance } from './types';

/** Display name for a connector id, falling back to the id when unknown. */
export function connectorName(connectorId: string, catalog: ConnectorDefinition[]): string {
  return catalog.find((connector) => connector.id === connectorId)?.name ?? connectorId;
}

/**
 * Review cadence for connector content. Broker opt-out forms and account
 * settings move constantly, so guidance older than this is shown as unverified:
 * a checklist that sends someone to a dead form is worse than no checklist.
 * Mirrors the CI gate in docs/connector-governance.md.
 */
export const CONNECTOR_REVIEW_CADENCE_DAYS = 90;

/** Whole days since a connector's content was last reviewed, or null if unknown. */
export function connectorReviewAgeDays(
  definition: Pick<ConnectorDefinition, 'lastReviewed'>,
  now: number = Date.now()
): number | null {
  if (!definition.lastReviewed) {
    return null;
  }

  const ts = Date.parse(definition.lastReviewed);
  if (!Number.isFinite(ts)) {
    return null;
  }

  return Math.max(0, Math.floor((now - ts) / (24 * 60 * 60 * 1000)));
}

/**
 * True when a connector's steps are past the review cadence — or carry no
 * review date at all, which is equally unverified.
 */
export function isConnectorStale(
  definition: Pick<ConnectorDefinition, 'lastReviewed'>,
  now: number = Date.now()
): boolean {
  const age = connectorReviewAgeDays(definition, now);
  return age === null || age > CONNECTOR_REVIEW_CADENCE_DAYS;
}

/** Connector instances whose scheduled recheck is due (nextCheckAt <= now). */
export function dueConnectorInstances(
  instances: ConnectorInstance[],
  now: number = Date.now()
): ConnectorInstance[] {
  return instances.filter((instance) => {
    if (!instance.nextCheckAt) {
      return false;
    }
    const ts = Date.parse(instance.nextCheckAt);
    return Number.isFinite(ts) && ts <= now;
  });
}
