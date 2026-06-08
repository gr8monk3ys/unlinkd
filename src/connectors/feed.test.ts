import { describe, it, expect } from 'vitest';
import { parseConnectorCatalogFeedV1, parseConnectorDefinitions } from './feed';
import type { ConnectorDefinition } from '../core/types';

function makeManualStep(overrides?: Partial<{ id: string; title: string; instructions: string }>) {
  return {
    id: overrides?.id ?? 'step-1',
    type: 'manual' as const,
    title: overrides?.title ?? 'Do something',
    instructions: overrides?.instructions ?? 'Follow these instructions'
  };
}

function makeAgentStep(overrides?: Partial<{ id: string; title: string }>) {
  return {
    id: overrides?.id ?? 'step-agent-1',
    type: 'agent' as const,
    title: overrides?.title ?? 'Automated step',
    action: {
      kind: 'navigate' as const,
      url: 'https://example.com'
    }
  };
}

function makeConnector(overrides?: Partial<ConnectorDefinition>): ConnectorDefinition {
  return {
    id: overrides?.id ?? 'test-connector',
    name: overrides?.name ?? 'Test Connector',
    category: overrides?.category ?? 'broker',
    description: overrides?.description ?? 'A test connector for unit testing',
    defaultRecheckDays: overrides?.defaultRecheckDays ?? 30,
    steps: overrides?.steps ?? [makeManualStep()],
    lastReviewed: overrides?.lastReviewed ?? '2026-06-08',
    ...(overrides?.jurisdictions ? { jurisdictions: overrides.jurisdictions } : {})
  };
}

function makeValidFeed(connectors?: ConnectorDefinition[]) {
  return {
    version: 1,
    catalogVersion: '2025.1.0',
    generatedAt: '2025-06-01T00:00:00.000Z',
    connectors: connectors ?? [makeConnector()]
  };
}

describe('parseConnectorCatalogFeedV1', () => {
  it('parses a valid feed with proper structure', () => {
    const feed = makeValidFeed();
    const result = parseConnectorCatalogFeedV1(feed);

    expect(result).not.toBeNull();
    expect(result!.version).toBe(1);
    expect(result!.catalogVersion).toBe('2025.1.0');
    expect(result!.generatedAt).toBe('2025-06-01T00:00:00.000Z');
    expect(result!.connectors).toHaveLength(1);
    expect(result!.connectors[0]!.id).toBe('test-connector');
  });

  it('parses a feed with multiple connectors', () => {
    const connectors = [
      makeConnector({ id: 'broker-a', name: 'Broker A', category: 'broker' }),
      makeConnector({ id: 'account-b', name: 'Account B', category: 'account' }),
      makeConnector({ id: 'search-c', name: 'Search C', category: 'search' })
    ];
    const result = parseConnectorCatalogFeedV1(makeValidFeed(connectors));

    expect(result).not.toBeNull();
    expect(result!.connectors).toHaveLength(3);
  });

  it('parses a feed with an empty connectors array', () => {
    const result = parseConnectorCatalogFeedV1(makeValidFeed([]));

    expect(result).not.toBeNull();
    expect(result!.connectors).toHaveLength(0);
  });

  it('returns null when version is missing', () => {
    const feed = { catalogVersion: '1.0', generatedAt: '2025-01-01', connectors: [] };
    expect(parseConnectorCatalogFeedV1(feed)).toBeNull();
  });

  it('returns null when version is not 1', () => {
    const feed = { ...makeValidFeed(), version: 2 };
    expect(parseConnectorCatalogFeedV1(feed)).toBeNull();
  });

  it('returns null when catalogVersion is missing', () => {
    const feed = makeValidFeed();
    const { catalogVersion: _cv, ...rest } = feed;
    void _cv;
    expect(parseConnectorCatalogFeedV1(rest)).toBeNull();
  });

  it('returns null when generatedAt is missing', () => {
    const feed = makeValidFeed();
    const { generatedAt: _ga, ...rest } = feed;
    void _ga;
    expect(parseConnectorCatalogFeedV1(rest)).toBeNull();
  });

  it('returns null when connectors is missing', () => {
    const feed = makeValidFeed();
    const { connectors: _c, ...rest } = feed;
    void _c;
    expect(parseConnectorCatalogFeedV1(rest)).toBeNull();
  });

  it('returns null for null input', () => {
    expect(parseConnectorCatalogFeedV1(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(parseConnectorCatalogFeedV1(undefined)).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(parseConnectorCatalogFeedV1('not-an-object')).toBeNull();
    expect(parseConnectorCatalogFeedV1(42)).toBeNull();
  });

  it('returns null when a connector has invalid shape', () => {
    const feed = {
      version: 1,
      catalogVersion: '1.0',
      generatedAt: '2025-01-01',
      connectors: [{ id: 'missing-fields' }]
    };
    expect(parseConnectorCatalogFeedV1(feed)).toBeNull();
  });

  it('returns null when catalogVersion is empty string', () => {
    const feed = { ...makeValidFeed(), catalogVersion: '' };
    expect(parseConnectorCatalogFeedV1(feed)).toBeNull();
  });

  it('returns null when generatedAt is empty string', () => {
    const feed = { ...makeValidFeed(), generatedAt: '' };
    expect(parseConnectorCatalogFeedV1(feed)).toBeNull();
  });
});

describe('parseConnectorDefinitions', () => {
  it('parses a valid array of connector definitions', () => {
    const connectors = [makeConnector()];
    const result = parseConnectorDefinitions(connectors);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0]!.id).toBe('test-connector');
    expect(result![0]!.name).toBe('Test Connector');
    expect(result![0]!.category).toBe('broker');
  });

  it('parses connectors with all valid categories', () => {
    const categories = ['broker', 'account', 'search', 'other'] as const;
    const connectors = categories.map((category) =>
      makeConnector({ id: `conn-${category}`, category })
    );
    const result = parseConnectorDefinitions(connectors);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(4);
  });

  it('parses a connector with a manual step', () => {
    const connector = makeConnector({
      steps: [makeManualStep({ id: 's1', title: 'Step one', instructions: 'Do X' })]
    });
    const result = parseConnectorDefinitions([connector]);

    expect(result).not.toBeNull();
    expect(result![0]!.steps).toHaveLength(1);
    expect(result![0]!.steps[0]!.type).toBe('manual');
  });

  it('parses a connector with an agent step', () => {
    const connector = makeConnector({ steps: [makeAgentStep()] });
    const result = parseConnectorDefinitions([connector]);

    expect(result).not.toBeNull();
    expect(result![0]!.steps[0]!.type).toBe('agent');
  });

  it('parses a connector with multiple steps', () => {
    const connector = makeConnector({
      steps: [makeManualStep({ id: 's1' }), makeAgentStep({ id: 's2' })]
    });
    const result = parseConnectorDefinitions([connector]);

    expect(result).not.toBeNull();
    expect(result![0]!.steps).toHaveLength(2);
  });

  it('parses a connector with optional jurisdictions', () => {
    const connector = makeConnector({ jurisdictions: ['US', 'EU'] });
    const result = parseConnectorDefinitions([connector]);

    expect(result).not.toBeNull();
    expect(result![0]!.jurisdictions).toEqual(['US', 'EU']);
  });

  it('parses a connector with optional evidenceHint on step', () => {
    const step = { ...makeManualStep(), evidenceHint: 'screenshot of confirmation' };
    const connector = makeConnector({ steps: [step] });
    const result = parseConnectorDefinitions([connector]);

    expect(result).not.toBeNull();
    expect(result![0]!.steps[0]).toHaveProperty('evidenceHint', 'screenshot of confirmation');
  });

  it('returns null when connector is missing id', () => {
    const { id: _id, ...rest } = makeConnector();
    void _id;
    expect(parseConnectorDefinitions([rest])).toBeNull();
  });

  it('returns null when connector is missing name', () => {
    const { name: _name, ...rest } = makeConnector();
    void _name;
    expect(parseConnectorDefinitions([rest])).toBeNull();
  });

  it('returns null when connector has invalid category', () => {
    const connector = { ...makeConnector(), category: 'invalid' };
    expect(parseConnectorDefinitions([connector])).toBeNull();
  });

  it('returns null when connector is missing description', () => {
    const { description: _desc, ...rest } = makeConnector();
    void _desc;
    expect(parseConnectorDefinitions([rest])).toBeNull();
  });

  it('returns null when defaultRecheckDays is zero', () => {
    const connector = makeConnector({ defaultRecheckDays: 0 });
    expect(parseConnectorDefinitions([connector])).toBeNull();
  });

  it('returns null when defaultRecheckDays is negative', () => {
    const connector = makeConnector({ defaultRecheckDays: -5 });
    expect(parseConnectorDefinitions([connector])).toBeNull();
  });

  it('returns null when steps array is empty', () => {
    const connector = makeConnector({ steps: [] });
    expect(parseConnectorDefinitions([connector])).toBeNull();
  });

  it('returns null for non-array input', () => {
    expect(parseConnectorDefinitions('not-an-array')).toBeNull();
    expect(parseConnectorDefinitions(42)).toBeNull();
    expect(parseConnectorDefinitions(null)).toBeNull();
  });

  it('parses an empty array successfully', () => {
    const result = parseConnectorDefinitions([]);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(0);
  });

  it('returns null when step id is empty', () => {
    const step = makeManualStep({ id: '' });
    const connector = makeConnector({ steps: [step] });
    expect(parseConnectorDefinitions([connector])).toBeNull();
  });

  it('returns null when step title is empty', () => {
    const step = makeManualStep({ title: '' });
    const connector = makeConnector({ steps: [step] });
    expect(parseConnectorDefinitions([connector])).toBeNull();
  });

  it('returns null when manual step instructions is empty', () => {
    const step = makeManualStep({ instructions: '' });
    const connector = makeConnector({ steps: [step] });
    expect(parseConnectorDefinitions([connector])).toBeNull();
  });
});
