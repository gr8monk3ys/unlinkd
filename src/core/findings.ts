import type { RiskFinding } from './types';

export type FindingStatus = NonNullable<RiskFinding['status']>;

export const findingStatuses: readonly FindingStatus[] = ['open', 'in_progress', 'mitigated'] as const;

export function isFindingStatus(value: unknown): value is FindingStatus {
  return typeof value === 'string' && (findingStatuses as readonly string[]).includes(value);
}

/**
 * Returns a new findings array with the status of a single finding updated.
 * Pure: callers persist the result. Unknown ids are a no-op.
 */
export function setFindingStatus(
  findings: RiskFinding[],
  id: string,
  status: FindingStatus
): RiskFinding[] {
  return findings.map((finding) => (finding.id === id ? { ...finding, status } : finding));
}

/** Counts findings by status, treating a missing status as `open`. */
export function countFindingsByStatus(findings: RiskFinding[]): Record<FindingStatus, number> {
  const counts: Record<FindingStatus, number> = { open: 0, in_progress: 0, mitigated: 0 };
  for (const finding of findings) {
    counts[finding.status ?? 'open'] += 1;
  }
  return counts;
}
