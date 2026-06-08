import { describe, expect, it } from 'vitest';
import { scoreFinding, sortFindingsByPriority } from './scoring';
import type { RiskFinding } from './types';

function makeFinding(
  overrides: Partial<RiskFinding> & Pick<RiskFinding, 'id' | 'title' | 'harm' | 'exploitability' | 'tier'>
): RiskFinding {
  return overrides;
}

describe('scoring', () => {
  describe('scoreFinding', () => {
    it('scores on a 0-100 scale', () => {
      // base = (9*0.6 + 8*0.4)/10 = 0.86; *1.15 (high) *1.0 (open) *100 = 98.9 -> 99
      const score = scoreFinding(makeFinding({ id: 'f', title: 'High', harm: 9, exploitability: 8, tier: 'high' }));
      expect(score).toBe(99);
    });

    it('ranks tiers: high > moderate > low for equal harm/exploitability', () => {
      const base = { harm: 6, exploitability: 6 } as const;
      const high = scoreFinding(makeFinding({ id: 'h', title: 'H', tier: 'high', ...base }));
      const moderate = scoreFinding(makeFinding({ id: 'm', title: 'M', tier: 'moderate', ...base }));
      const low = scoreFinding(makeFinding({ id: 'l', title: 'L', tier: 'low', ...base }));
      expect(high).toBeGreaterThan(moderate);
      expect(moderate).toBeGreaterThan(low);
    });

    it('sinks findings that are in progress or mitigated below open ones', () => {
      const fields = { harm: 8, exploitability: 8, tier: 'high' as const };
      const open = scoreFinding(makeFinding({ id: 'o', title: 'O', status: 'open', ...fields }));
      const inProgress = scoreFinding(makeFinding({ id: 'p', title: 'P', status: 'in_progress', ...fields }));
      const mitigated = scoreFinding(makeFinding({ id: 'm', title: 'M', status: 'mitigated', ...fields }));
      expect(open).toBeGreaterThan(inProgress);
      expect(inProgress).toBeGreaterThan(mitigated);
    });

    it('treats a missing status as open', () => {
      const fields = { id: 'f', title: 'F', harm: 7, exploitability: 7, tier: 'moderate' as const };
      expect(scoreFinding(makeFinding(fields))).toBe(scoreFinding(makeFinding({ ...fields, status: 'open' })));
    });

    it('returns 0 for zero harm and exploitability', () => {
      expect(scoreFinding(makeFinding({ id: 'f', title: 'Z', harm: 0, exploitability: 0, tier: 'high' }))).toBe(0);
    });

    it('clamps to at most 100', () => {
      expect(scoreFinding(makeFinding({ id: 'f', title: 'Max', harm: 10, exploitability: 10, tier: 'high' }))).toBe(100);
    });
  });

  describe('sortFindingsByPriority', () => {
    it('sorts findings by highest priority first', () => {
      const sorted = sortFindingsByPriority([
        makeFinding({ id: 'a', title: 'A', harm: 3, exploitability: 2, tier: 'low' }),
        makeFinding({ id: 'b', title: 'B', harm: 8, exploitability: 8, tier: 'high' })
      ]);
      expect(sorted[0]?.id).toBe('b');
    });

    it('ranks an open low-tier finding above a mitigated high-tier one', () => {
      const sorted = sortFindingsByPriority([
        makeFinding({ id: 'mit', title: 'Mitigated high', harm: 9, exploitability: 9, tier: 'high', status: 'mitigated' }),
        makeFinding({ id: 'open', title: 'Open low', harm: 4, exploitability: 3, tier: 'low', status: 'open' })
      ]);
      expect(sorted[0]?.id).toBe('open');
    });

    it('returns empty array for empty input', () => {
      expect(sortFindingsByPriority([])).toEqual([]);
    });

    it('does not mutate the original array', () => {
      const original = [
        makeFinding({ id: 'a', title: 'A', harm: 3, exploitability: 2, tier: 'low' }),
        makeFinding({ id: 'b', title: 'B', harm: 8, exploitability: 8, tier: 'high' })
      ];
      const sorted = sortFindingsByPriority(original);
      expect(original[0]?.id).toBe('a');
      expect(sorted[0]?.id).toBe('b');
    });

    it('breaks ties deterministically by title', () => {
      const sorted = sortFindingsByPriority([
        makeFinding({ id: 'z', title: 'Zebra', harm: 5, exploitability: 5, tier: 'moderate' }),
        makeFinding({ id: 'a', title: 'Apple', harm: 5, exploitability: 5, tier: 'moderate' })
      ]);
      expect(sorted.map((f) => f.id)).toEqual(['a', 'z']);
    });
  });
});
