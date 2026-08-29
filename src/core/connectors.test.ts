import { describe, expect, it } from 'vitest';
import type { ConnectorDefinition, ConnectorInstance } from './types';
import {
  CONNECTOR_REVIEW_CADENCE_DAYS,
  connectorName,
  connectorReviewAgeDays,
  dueConnectorInstances,
  isConnectorStale
} from './connectors';

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

describe('connector review freshness', () => {
  const now = Date.parse('2026-07-01T00:00:00.000Z');
  const DAY_MS = 24 * 60 * 60 * 1000;

  function reviewed(daysAgo: number): { lastReviewed: string } {
    return { lastReviewed: new Date(now - daysAgo * DAY_MS).toISOString().slice(0, 10) };
  }

  it('reports whole days since the last review', () => {
    expect(connectorReviewAgeDays(reviewed(10), now)).toBe(10);
    expect(connectorReviewAgeDays(reviewed(0), now)).toBe(0);
  });

  it('returns null for a missing or unparseable review date', () => {
    expect(connectorReviewAgeDays({ lastReviewed: undefined }, now)).toBeNull();
    expect(connectorReviewAgeDays({ lastReviewed: 'not-a-date' }, now)).toBeNull();
  });

  it('treats content within the cadence as fresh', () => {
    expect(isConnectorStale(reviewed(CONNECTOR_REVIEW_CADENCE_DAYS - 1), now)).toBe(false);
    expect(isConnectorStale(reviewed(CONNECTOR_REVIEW_CADENCE_DAYS), now)).toBe(false);
  });

  it('treats content past the cadence as stale', () => {
    expect(isConnectorStale(reviewed(CONNECTOR_REVIEW_CADENCE_DAYS + 1), now)).toBe(true);
  });

  it('treats an undated connector as unverified rather than fresh', () => {
    expect(isConnectorStale({ lastReviewed: undefined }, now)).toBe(true);
  });
});
