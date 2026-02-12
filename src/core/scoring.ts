import type { RiskFinding, ThreatTier } from './types';

const tierMultiplier: Record<ThreatTier, number> = {
  low: 0.8,
  moderate: 1,
  high: 1.25
};

export function scoreFinding(finding: RiskFinding): number {
  const weighted = finding.harm * 0.6 + finding.exploitability * 0.4;
  return Math.round(weighted * tierMultiplier[finding.tier]);
}

export function sortFindingsByPriority(findings: RiskFinding[]): RiskFinding[] {
  return [...findings].sort((a, b) => scoreFinding(b) - scoreFinding(a));
}
