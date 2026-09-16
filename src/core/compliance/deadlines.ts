import type { ConnectorInstance, RemovalRequest, RequestOutcome } from '../types';
import type { VaultStateV1 } from '../vault';
import {
  COMPLIANCE_PROFILES,
  isProfileStale,
  type ComplianceBasis,
  type ComplianceProfile,
  type ComplianceWindow
} from './profiles';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days before the deadline at which a request starts being urgent. */
export const DUE_SOON_DAYS = 7;

export type DeadlineStatus =
  /** The request is settled: the controller answered, or the user closed it. */
  | 'closed'
  /** Running, with time left. */
  | 'pending'
  /** Running, inside DUE_SOON_DAYS. */
  | 'due_soon'
  /** The statutory window has passed with no terminal answer. */
  | 'overdue'
  /** No deadline can be computed — unknown profile, or an unusable send date. */
  | 'unknown';

export interface DeadlineComputation {
  status: DeadlineStatus;
  /** ISO date (YYYY-MM-DD), or null when no deadline could be computed. */
  dueAt: string | null;
  /** Whole calendar days; negative when overdue. */
  daysRemaining: number | null;
  basis: ComplianceBasis | null;
  profile: ComplianceProfile | null;
  /** The arithmetic behind dueAt, so the number can be checked rather than trusted. */
  explanation: string;
  extended: boolean;
  overridden: boolean;
  /** The profile is past its review cadence; present the deadline as unverified. */
  stale: boolean;
}

/** Outcomes that stop the clock. A partial answer or an ID demand does not. */
const TERMINAL_OUTCOMES: readonly RequestOutcome[] = ['completed', 'refused'];

function utcDayNumber(ms: number): number {
  return Math.floor(ms / DAY_MS);
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Calendar-month arithmetic with end-of-month clamping: 31 January plus one
 * month is 28 (or 29) February, not 2 March. Treating a statutory "one month"
 * as 30 days produces a wrong date in most months of the year.
 */
function addMonths(ms: number, months: number): number {
  const date = new Date(ms);
  const dayOfMonth = date.getUTCDate();
  date.setUTCMonth(date.getUTCMonth() + months);

  if (date.getUTCDate() !== dayOfMonth) {
    // Overflowed into the following month; step back to that month's last day.
    date.setUTCDate(0);
  }

  return date.getTime();
}

function addWindow(ms: number, window: ComplianceWindow): number {
  return window.unit === 'months' ? addMonths(ms, window.value) : ms + window.value * DAY_MS;
}

function describeWindow(window: ComplianceWindow): string {
  const noun = window.unit === 'months' ? 'month' : 'day';
  return `${window.value} ${noun}${window.value === 1 ? '' : 's'}`;
}

function unknown(explanation: string, profile: ComplianceProfile | null): DeadlineComputation {
  return {
    status: 'unknown',
    dueAt: null,
    daysRemaining: null,
    basis: null,
    profile,
    explanation,
    extended: false,
    overridden: false,
    stale: profile ? isProfileStale(profile) : true
  };
}

/**
 * Derive a request's deadline from the facts recorded against it.
 *
 * Never throws: an unknown profile or an unparseable date yields an `unknown`
 * status carrying the reason, because one bad reference must not take down the
 * dashboard that every other request is displayed on.
 */
export function computeDeadline(
  request: RemovalRequest,
  profiles: ComplianceProfile[] = COMPLIANCE_PROFILES,
  now: number = Date.now()
): DeadlineComputation {
  const profile = profiles.find((candidate) => candidate.id === request.profileId) ?? null;
  if (!profile) {
    return unknown(`No compliance profile "${request.profileId}" is loaded, so no deadline can be computed.`, null);
  }

  const basis = profile.bases.find((candidate) => candidate.id === request.basisId) ?? null;
  if (!basis) {
    return unknown(`Profile "${profile.name}" has no basis "${request.basisId}", so no deadline can be computed.`, profile);
  }

  const sentAt = Date.parse(request.sentAt);
  if (!Number.isFinite(sentAt)) {
    return unknown(`The send date "${request.sentAt}" could not be read, so no deadline can be computed.`, profile);
  }

  const stale = isProfileStale(profile, now);
  const extended = request.responses.some((response) => response.extensionClaimed === true);

  let dueMs: number;
  let explanation: string;
  const overridden = Boolean(request.dueAtOverride);

  if (request.dueAtOverride) {
    const override = Date.parse(request.dueAtOverride);
    if (!Number.isFinite(override)) {
      return unknown(`The deadline override "${request.dueAtOverride}" could not be read.`, profile);
    }
    dueMs = override;
    explanation = `Deadline set manually to ${isoDate(dueMs)}, overriding the ${basis.citation} default.`;
  } else {
    dueMs = addWindow(sentAt, basis.responseWindow);
    explanation =
      `Sent ${isoDate(sentAt)}, plus ${describeWindow(basis.responseWindow)} under ${basis.citation}`;

    if (extended && basis.extensionWindow) {
      dueMs = addWindow(dueMs, basis.extensionWindow);
      explanation += `, plus a ${describeWindow(basis.extensionWindow)} extension the operator claimed`;
    }

    explanation += `, due ${isoDate(dueMs)}.`;
  }

  const settled =
    Boolean(request.closedAt) ||
    request.responses.some((response) => TERMINAL_OUTCOMES.includes(response.outcome));

  const daysRemaining = utcDayNumber(dueMs) - utcDayNumber(now);

  let status: DeadlineStatus;
  if (settled) {
    status = 'closed';
  } else if (daysRemaining < 0) {
    status = 'overdue';
  } else if (daysRemaining <= DUE_SOON_DAYS) {
    status = 'due_soon';
  } else {
    status = 'pending';
  }

  return {
    status,
    dueAt: isoDate(dueMs),
    daysRemaining,
    basis,
    profile,
    explanation,
    extended: extended && Boolean(basis.extensionWindow),
    overridden,
    stale
  };
}

export interface TrackedRequest {
  instance: ConnectorInstance;
  request: RemovalRequest;
  computation: DeadlineComputation;
}

/** Every request across the vault, paired with its computed deadline. */
export function trackedRequests(
  vault: VaultStateV1,
  profiles: ComplianceProfile[] = COMPLIANCE_PROFILES,
  now: number = Date.now()
): TrackedRequest[] {
  return vault.connectorInstances.flatMap((instance) =>
    (instance.requests ?? []).map((request) => ({
      instance,
      request,
      computation: computeDeadline(request, profiles, now)
    }))
  );
}

/**
 * Requests needing attention, worst first: the most overdue at the top, then
 * those approaching their deadline. Settled and not-yet-urgent requests are
 * left out — this feeds a worklist, not a report.
 */
export function requestsNeedingAttention(
  vault: VaultStateV1,
  profiles: ComplianceProfile[] = COMPLIANCE_PROFILES,
  now: number = Date.now()
): TrackedRequest[] {
  return trackedRequests(vault, profiles, now)
    .filter((tracked) => tracked.computation.status === 'overdue' || tracked.computation.status === 'due_soon')
    .sort((a, b) => (a.computation.daysRemaining ?? 0) - (b.computation.daysRemaining ?? 0));
}
