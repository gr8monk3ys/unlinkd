import { describe, expect, it } from 'vitest';
import { buildExposureGraph } from './graph';

describe('graph', () => {
  it('creates an edge when email is reused', () => {
    const graph = buildExposureGraph([
      { id: '1', type: 'email', value: 'one@example.com', sensitivity: 2, consent: true },
      { id: '2', type: 'email', value: 'one@example.com', sensitivity: 2, consent: true }
    ]);

    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]?.reason).toBe('email_reuse');
  });

  it('does not infer edges from non-consented identifiers', () => {
    const graph = buildExposureGraph([
      { id: '1', type: 'email', value: 'one@example.com', sensitivity: 2, consent: true },
      { id: '2', type: 'email', value: 'one@example.com', sensitivity: 2, consent: false }
    ]);

    expect(graph.nodes).toHaveLength(1);
    expect(graph.edges).toHaveLength(0);
  });
});
