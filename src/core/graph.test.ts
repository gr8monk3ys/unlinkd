import { describe, expect, it } from 'vitest';
import { buildExposureGraph } from './graph';
import type { Identifier } from './types';

function makeId(overrides: Partial<Identifier> & Pick<Identifier, 'id' | 'type' | 'value'>): Identifier {
  return { sensitivity: 2, consent: true, ...overrides };
}

describe('graph', () => {
  it('creates an edge when email is reused', () => {
    const graph = buildExposureGraph([
      makeId({ id: '1', type: 'email', value: 'one@example.com' }),
      makeId({ id: '2', type: 'email', value: 'one@example.com' })
    ]);

    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]?.reason).toBe('email_reuse');
  });

  it('does not infer edges from non-consented identifiers', () => {
    const graph = buildExposureGraph([
      makeId({ id: '1', type: 'email', value: 'one@example.com' }),
      makeId({ id: '2', type: 'email', value: 'one@example.com', consent: false })
    ]);

    expect(graph.nodes).toHaveLength(1);
    expect(graph.edges).toHaveLength(0);
  });

  it('creates username_reuse edge for matching usernames', () => {
    const graph = buildExposureGraph([
      makeId({ id: '1', type: 'username', value: 'johndoe' }),
      makeId({ id: '2', type: 'username', value: 'johndoe' })
    ]);

    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]?.reason).toBe('username_reuse');
  });

  it('creates phone_recovery edge for matching phone values', () => {
    const graph = buildExposureGraph([
      makeId({ id: '1', type: 'phone', value: '555-0100' }),
      makeId({ id: '2', type: 'phone', value: '555-0100' })
    ]);

    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]?.reason).toBe('phone_recovery');
  });

  it('returns empty graph for empty input', () => {
    const graph = buildExposureGraph([]);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
  });

  it('does not create edge for different values of same type', () => {
    const graph = buildExposureGraph([
      makeId({ id: '1', type: 'email', value: 'a@a.com' }),
      makeId({ id: '2', type: 'email', value: 'b@b.com' })
    ]);

    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(0);
  });

  it('deduplicates symmetric edges', () => {
    const graph = buildExposureGraph([
      makeId({ id: '1', type: 'email', value: 'same@test.com' }),
      makeId({ id: '2', type: 'email', value: 'same@test.com' })
    ]);

    // Should only have 1 edge, not 2 (since A→B and B→A are the same)
    expect(graph.edges).toHaveLength(1);
  });

  it('case-insensitive value matching', () => {
    const graph = buildExposureGraph([
      makeId({ id: '1', type: 'email', value: 'Test@Example.com' }),
      makeId({ id: '2', type: 'email', value: 'test@example.com' })
    ]);

    expect(graph.edges).toHaveLength(1);
  });

  it('handles single identifier without edges', () => {
    const graph = buildExposureGraph([
      makeId({ id: '1', type: 'email', value: 'solo@test.com' })
    ]);

    expect(graph.nodes).toHaveLength(1);
    expect(graph.edges).toHaveLength(0);
  });
});
