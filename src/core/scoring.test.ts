import { describe, expect, it } from 'vitest';
import { scoreFinding, sortFindingsByPriority } from './scoring';

describe('scoring', () => {
  it('applies tier multiplier', () => {
    const score = scoreFinding({
      id: 'f',
      title: 'High risk',
      harm: 8,
      exploitability: 8,
      tier: 'high'
    });

    expect(score).toBe(10);
  });

  it('sorts findings by highest priority', () => {
    const sorted = sortFindingsByPriority([
      { id: 'a', title: 'A', harm: 3, exploitability: 2, tier: 'low' },
      { id: 'b', title: 'B', harm: 8, exploitability: 8, tier: 'high' }
    ]);

    expect(sorted[0]?.id).toBe('b');
  });
});
