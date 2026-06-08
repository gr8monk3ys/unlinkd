import type { RiskFinding, ThreatTier } from './types';
import { type FindingStatus } from './findings';

// Weight harm a bit higher than exploitability.
const HARM_WEIGHT = 0.6;
const EXPLOITABILITY_WEIGHT = 0.4;

// Tier scales the base score. Kept close to 1 so tier nudges rather than dominates.
const tierFactor: Record<ThreatTier, number> = {
  low: 0.85,
  moderate: 1.0,
  high: 1.15
};

// Status sinks findings that are already being handled or resolved, so the
// priority list surfaces what still needs attention.
const statusFactor: Record<FindingStatus, number> = {
  open: 1.0,
  in_progress: 0.5,
  mitigated: 0.15
};

const tierRank: Record<ThreatTier, number> = { low: 1, moderate: 2, high: 3 };
const statusRank: Record<FindingStatus, number> = { mitigated: 0, in_progress: 1, open: 2 };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function statusOf(finding: RiskFinding): FindingStatus {
  return finding.status ?? 'open';
}

/**
 * Priority score on a 0–100 scale.
 *
 * Combines a harm/exploitability base, a threat-tier factor, and a status
 * factor (open findings outrank in-progress, which outrank mitigated). The
 * wider scale and status weighting spread findings out so the ranking is
 * actually meaningful instead of clustering everything in a narrow band.
 */
export function scoreFinding(finding: RiskFinding): number {
  const harm = clamp(finding.harm, 0, 10);
  const exploitability = clamp(finding.exploitability, 0, 10);
  const base = (harm * HARM_WEIGHT + exploitability * EXPLOITABILITY_WEIGHT) / 10; // 0..1
  const raw = base * tierFactor[finding.tier] * statusFactor[statusOf(finding)] * 100;
  return clamp(Math.round(raw), 0, 100);
}

/**
 * Sorts a copy of the findings by descending priority. Ties are broken
 * deterministically (status, then tier, then harm, exploitability, and finally
 * title) so the order is stable across renders and rescans.
 */
export function sortFindingsByPriority(findings: RiskFinding[]): RiskFinding[] {
  return [...findings].sort((a, b) => {
    const byScore = scoreFinding(b) - scoreFinding(a);
    if (byScore !== 0) return byScore;

    const byStatus = statusRank[statusOf(b)] - statusRank[statusOf(a)];
    if (byStatus !== 0) return byStatus;

    const byTier = tierRank[b.tier] - tierRank[a.tier];
    if (byTier !== 0) return byTier;

    if (b.harm !== a.harm) return b.harm - a.harm;
    if (b.exploitability !== a.exploitability) return b.exploitability - a.exploitability;

    return a.title.localeCompare(b.title);
  });
}
