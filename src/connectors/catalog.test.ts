import { describe, expect, it } from 'vitest';
import type { ConnectorDefinition } from '../core/types';
import {
  builtinConnectorCatalog,
  getConnectorDefinition,
  mergeConnectorCatalogs
} from './catalog';

function makeConnector(overrides: Partial<ConnectorDefinition> & { id: string }): ConnectorDefinition {
  return {
    name: overrides.id,
    category: 'other',
    description: 'test connector',
    defaultRecheckDays: 30,
    steps: [],
    ...overrides
  };
}

describe('builtinConnectorCatalog', () => {
  it('has 3 entries', () => {
    expect(builtinConnectorCatalog).toHaveLength(3);
  });
});

describe('getConnectorDefinition', () => {
  it('returns the connector when found', () => {
    const result = getConnectorDefinition('broker-whitepages', builtinConnectorCatalog);
    expect(result).not.toBeNull();
    expect(result?.id).toBe('broker-whitepages');
    expect(result?.name).toBe('Whitepages (Opt-out)');
  });

  it('returns null when the connector is not found', () => {
    const result = getConnectorDefinition('nonexistent-connector', builtinConnectorCatalog);
    expect(result).toBeNull();
  });
});

describe('mergeConnectorCatalogs', () => {
  it('merges two catalogs without duplicates', () => {
    const builtin = [makeConnector({ id: 'a' }), makeConnector({ id: 'b' })];
    const overrides = [makeConnector({ id: 'c' })];

    const merged = mergeConnectorCatalogs(builtin, overrides);

    expect(merged).toHaveLength(3);
    expect(merged.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('overrides a builtin entry with the same id', () => {
    const builtin = [makeConnector({ id: 'a', name: 'Original' })];
    const overrides = [makeConnector({ id: 'a', name: 'Overridden' })];

    const merged = mergeConnectorCatalogs(builtin, overrides);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.name).toBe('Overridden');
  });

  it('sorts the merged result by id', () => {
    const builtin = [makeConnector({ id: 'z-last' }), makeConnector({ id: 'a-first' })];
    const overrides = [makeConnector({ id: 'm-middle' })];

    const merged = mergeConnectorCatalogs(builtin, overrides);

    expect(merged.map((c) => c.id)).toEqual(['a-first', 'm-middle', 'z-last']);
  });

  it('handles empty builtin array', () => {
    const overrides = [makeConnector({ id: 'x' })];

    const merged = mergeConnectorCatalogs([], overrides);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('x');
  });

  it('handles empty overrides array', () => {
    const builtin = [makeConnector({ id: 'x' })];

    const merged = mergeConnectorCatalogs(builtin, []);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('x');
  });

  it('handles both arrays empty', () => {
    const merged = mergeConnectorCatalogs([], []);

    expect(merged).toHaveLength(0);
    expect(merged).toEqual([]);
  });
});
