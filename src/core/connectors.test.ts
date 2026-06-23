import { describe, expect, it } from 'vitest';
import type { ConnectorDefinition, ConnectorInstance } from './types';
import { connectorName, dueConnectorInstances } from './connectors';

const catalog: ConnectorDefinition[] = [
  {
    id: 'broker-x',
    name: 'Broker X',
    category: 'broker',
    description: 'd',
    defaultRecheckDays: 30,
    lastReviewed: '2026-06-08',
    steps: [{ id: 's', type: 'manual', title: 't', instructions: 'i' }]
  }
];

function inst(id: string, nextCheckAt?: string): ConnectorInstance {
  return {
    id,
    connectorId: 'broker-x',
    personaId: 'p1',
    state: 'recheck_scheduled',
    createdAt: 'x',
    updatedAt: 'x',
    evidence: [],
    ...(nextCheckAt ? { nextCheckAt } : {})
  };
}

describe('connectorName', () => {
  it('returns the catalog name', () => {
    expect(connectorName('broker-x', catalog)).toBe('Broker X');
  });

  it('falls back to the id for unknown connectors', () => {
    expect(connectorName('unknown', catalog)).toBe('unknown');
  });
});

describe('dueConnectorInstances', () => {
  const now = Date.parse('2026-06-01T00:00:00.000Z');

  it('includes only instances whose nextCheckAt is due', () => {
    const instances = [
      inst('past', '2026-05-01T00:00:00.000Z'),
      inst('future', '2026-07-01T00:00:00.000Z'),
      inst('none')
    ];
    const due = dueConnectorInstances(instances, now);
    expect(due.map((i) => i.id)).toEqual(['past']);
  });

  it('ignores instances with an unparseable date', () => {
    expect(dueConnectorInstances([inst('bad', 'not-a-date')], now)).toEqual([]);
  });
});
