import { describe, expect, it } from 'vitest';
import { scoreFinding, sortFindingsByPriority } from './scoring';
import type { RiskFinding } from './types';

function makeFinding(overrides: Partial<RiskFinding> & Pick<RiskFinding, 'id' | 'title' | 'harm' | 'exploitability' | 'tier'>): RiskFinding {
  return overrides;
}

describe('scoring', () => {
  describe('scoreFinding', () => {
    it('applies high tier multiplier (1.25)', () => {
      const score = scoreFinding(makeFinding({
        id: 'f', title: 'High risk', harm: 8, exploitability: 8, tier: 'high'
      }));

      // weighted = 8*0.6 + 8*0.4 = 8, score = round(8 * 1.25) = 10
      expect(score).toBe(10);
    });

    it('applies moderate tier multiplier (1.0)', () => {
      const score = scoreFinding(makeFinding({
        id: 'f', title: 'Moderate', harm: 6, exploitability: 4, tier: 'moderate'
      }));

      // weighted = 6*0.6 + 4*0.4 = 5.2, score = round(5.2 * 1) = 5
      expect(score).toBe(5);
    });

    it('applies low tier multiplier (0.8)', () => {
      const score = scoreFinding(makeFinding({
        id: 'f', title: 'Low', harm: 5, exploitability: 5, tier: 'low'
      }));

      // weighted = 5*0.6 + 5*0.4 = 5, score = round(5 * 0.8) = 4
      expect(score).toBe(4);
    });

    it('handles zero harm and exploitability', () => {
      const score = scoreFinding(makeFinding({
        id: 'f', title: 'Zero', harm: 0, exploitability: 0, tier: 'high'
      }));

      expect(score).toBe(0);
    });

    it('handles maximum values', () => {
      const score = scoreFinding(makeFinding({
        id: 'f', title: 'Max', harm: 10, exploitability: 10, tier: 'high'
      }));

      // weighted = 10*0.6 + 10*0.4 = 10, score = round(10 * 1.25) = 13
      expect(score).toBe(13);
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

    it('preserves order for equal scores', () => {
      const sorted = sortFindingsByPriority([
        makeFinding({ id: 'a', title: 'A', harm: 5, exploitability: 5, tier: 'moderate' }),
        makeFinding({ id: 'b', title: 'B', harm: 5, exploitability: 5, tier: 'moderate' })
      ]);

      expect(sorted).toHaveLength(2);
    });
  });
});
