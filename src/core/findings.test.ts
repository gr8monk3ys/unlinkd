import { describe, expect, it } from 'vitest';
import { countFindingsByStatus, isFindingStatus, setFindingStatus } from './findings';
import type { RiskFinding } from './types';

function finding(id: string, status?: RiskFinding['status']): RiskFinding {
  return { id, title: `t-${id}`, harm: 5, exploitability: 5, tier: 'moderate', status };
}

describe('findings', () => {
  it('updates the status of a single finding immutably', () => {
    const findings = [finding('a'), finding('b', 'open')];
    const next = setFindingStatus(findings, 'b', 'mitigated');

    expect(next).not.toBe(findings);
    expect(next.find((f) => f.id === 'b')?.status).toBe('mitigated');
    expect(next.find((f) => f.id === 'a')?.status).toBeUndefined();
    // original untouched
    expect(findings.find((f) => f.id === 'b')?.status).toBe('open');
  });

  it('is a no-op for unknown ids', () => {
    const findings = [finding('a', 'open')];
    const next = setFindingStatus(findings, 'missing', 'mitigated');
    expect(next.find((f) => f.id === 'a')?.status).toBe('open');
  });

  it('counts by status, treating missing status as open', () => {
    const counts = countFindingsByStatus([
      finding('a'),
      finding('b', 'open'),
      finding('c', 'in_progress'),
      finding('d', 'mitigated'),
      finding('e', 'mitigated')
    ]);
    expect(counts).toEqual({ open: 2, in_progress: 1, mitigated: 2 });
  });

  it('validates status strings', () => {
    expect(isFindingStatus('open')).toBe(true);
    expect(isFindingStatus('mitigated')).toBe(true);
    expect(isFindingStatus('done')).toBe(false);
    expect(isFindingStatus(3)).toBe(false);
  });
});
