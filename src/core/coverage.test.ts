import { describe, expect, it } from 'vitest';
import { CA_BROKER_REGISTRY, DROP_CONNECTOR_ID, summarizeCoverage } from './coverage';
import type { ConnectorDefinition, ConnectorInstance, ConnectorState, RemovalRequest } from './types';

const catalog: ConnectorDefinition[] = [
  { id: DROP_CONNECTOR_ID, name: 'California DROP', category: 'broker', description: '', defaultRecheckDays: 45, steps: [] },
  { id: 'broker-a', name: 'Broker A', category: 'broker', description: '', defaultRecheckDays: 90, steps: [] },
  { id: 'broker-b', name: 'Broker B', category: 'broker', description: '', defaultRecheckDays: 90, steps: [] },
  { id: 'account-x', name: 'Account X', category: 'account', description: '', defaultRecheckDays: 90, steps: [] }
];

function instance(connectorId: string, state: ConnectorState, requests?: RemovalRequest[]): ConnectorInstance {
  return {
    id: `ci-${connectorId}-${state}`,
    connectorId,
    personaId: 'p1',
    state,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    evidence: [],
    requests
  };
}

function dropRequest(sentAt: string, responses: RemovalRequest['responses'] = []): RemovalRequest {
  return {
    id: 'drop-req',
    profileId: 'ca_drop',
    basisId: 'ca_drop.deletion',
    channel: 'web_form',
    sentAt,
    responses
  };
}

const NOW = Date.parse('2026-08-28T00:00:00Z');

describe('summarizeCoverage', () => {
  it('counts only brokers, not account connectors', () => {
    const summary = summarizeCoverage(
      [instance('broker-a', 'proof_captured'), instance('account-x', 'proof_captured')],
      catalog,
      NOW
    );

    expect(summary.brokersWithProof).toBe(1);
    expect(summary.brokersInCatalog).toBe(3);
  });

  it('counts a broker as proven only once evidence is captured', () => {
    const summary = summarizeCoverage(
      [instance('broker-a', 'executed'), instance('broker-b', 'proof_captured')],
      catalog,
      NOW
    );

    expect(summary.brokersStarted).toBe(2);
    expect(summary.brokersWithProof).toBe(1);
  });

  it('is honest that individual opt-outs do not close the gap', () => {
    const summary = summarizeCoverage([instance('broker-a', 'proof_captured')], catalog, NOW);

    expect(summary.dropStatus).toBe('none');
    expect(summary.headline).toContain('500+ registered brokers');
    expect(summary.headline).toMatch(/will not close that gap/i);
  });

  it('reports a running DROP request as covering the registry', () => {
    const summary = summarizeCoverage(
      [instance(DROP_CONNECTOR_ID, 'executed', [dropRequest('2026-08-20T00:00:00.000Z')])],
      catalog,
      NOW
    );

    expect(summary.dropStatus).toBe('submitted');
    expect(summary.headline).toContain('500+ registered brokers');
  });

  it('flags a DROP request that has blown its 90-day window', () => {
    const summary = summarizeCoverage(
      [instance(DROP_CONNECTOR_ID, 'executed', [dropRequest('2026-01-01T00:00:00.000Z')])],
      catalog,
      NOW
    );

    expect(summary.dropStatus).toBe('overdue');
    expect(summary.headline).toMatch(/past its deadline/i);
  });

  it('reports a confirmed DROP deletion as completed', () => {
    const summary = summarizeCoverage(
      [
        instance(DROP_CONNECTOR_ID, 'proof_captured', [
          dropRequest('2026-05-01T00:00:00.000Z', [
            { id: 'r', receivedAt: '2026-06-01T00:00:00.000Z', outcome: 'completed' }
          ])
        ])
      ],
      catalog,
      NOW
    );

    expect(summary.dropStatus).toBe('completed');
    expect(summary.headline).toMatch(/confirmed/i);
  });

  it('does not claim DROP coverage from an added connector with no request logged', () => {
    const summary = summarizeCoverage([instance(DROP_CONNECTOR_ID, 'discovered')], catalog, NOW);

    // Adding the connector is not the same as submitting the request.
    expect(summary.dropStatus).toBe('none');
  });

  it('dates and sources the denominator so it can be checked', () => {
    expect(Number.isFinite(Date.parse(CA_BROKER_REGISTRY.asOf))).toBe(true);
    expect(CA_BROKER_REGISTRY.sourceUrl).toMatch(/^https:\/\//);
  });
});
