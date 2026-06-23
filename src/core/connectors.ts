import type { ConnectorDefinition, ConnectorInstance } from './types';

/** Display name for a connector id, falling back to the id when unknown. */
export function connectorName(connectorId: string, catalog: ConnectorDefinition[]): string {
  return catalog.find((connector) => connector.id === connectorId)?.name ?? connectorId;
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
