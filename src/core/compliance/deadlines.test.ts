import { describe, expect, it } from 'vitest';
import type { RemovalRequest, RequestOutcome } from '../types';
import { computeDeadline, DUE_SOON_DAYS, requestsNeedingAttention } from './deadlines';
import { COMPLIANCE_PROFILES, type ComplianceProfile } from './profiles';
import type { VaultStateV1 } from '../vault';

const at = (iso: string): number => Date.parse(iso);

function request(overrides: Partial<RemovalRequest> = {}): RemovalRequest {
  return {
    id: 'r1',
    profileId: 'gdpr',
    basisId: 'gdpr.art17',
    channel: 'email',
    sentAt: '2026-07-14T00:00:00.000Z',
    responses: [],
    ...overrides
  };
}

function response(outcome: RequestOutcome, extras: Record<string, unknown> = {}) {
  return { id: 'resp', receivedAt: '2026-07-20T00:00:00.000Z', outcome, ...extras };
}

/** Freshly reviewed so staleness never confounds the deadline assertions. */
function freshProfiles(now: string): ComplianceProfile[] {
  return COMPLIANCE_PROFILES.map((profile) => ({ ...profile, lastReviewed: now.slice(0, 10) }));
}

describe('computeDeadline', () => {
  it('adds one calendar month for a GDPR erasure request', () => {
    const result = computeDeadline(request(), freshProfiles('2026-07-20'), at('2026-07-20T00:00:00Z'));

    expect(result.dueAt).toBe('2026-08-14');
    expect(result.status).toBe('pending');
    expect(result.daysRemaining).toBe(25);
  });

  it('clamps to the last day of a short month rather than overflowing', () => {
    // 31 January plus one month is 28 February, not 3 March.
    const result = computeDeadline(
      request({ sentAt: '2026-01-31T00:00:00.000Z' }),
      freshProfiles('2026-01-31'),
      at('2026-02-01T00:00:00Z')
    );

    expect(result.dueAt).toBe('2026-02-28');
  });

  it('clamps to 29 February in a leap year', () => {
    const result = computeDeadline(
      request({ sentAt: '2028-01-31T00:00:00.000Z' }),
      freshProfiles('2028-01-31'),
      at('2028-02-01T00:00:00Z')
    );

    expect(result.dueAt).toBe('2028-02-29');
  });

  it('reports a passed deadline as overdue with negative days', () => {
    const result = computeDeadline(request(), freshProfiles('2026-08-26'), at('2026-08-26T00:00:00Z'));

    expect(result.status).toBe('overdue');
    expect(result.daysRemaining).toBe(-12);
  });

  it('flags a request inside the due-soon window', () => {
    const result = computeDeadline(request(), freshProfiles('2026-08-10'), at('2026-08-10T00:00:00Z'));

    expect(result.status).toBe('due_soon');
    expect(result.daysRemaining).toBeLessThanOrEqual(DUE_SOON_DAYS);
  });

  it('extends the window when the operator claimed an extension', () => {
    const result = computeDeadline(
      request({ responses: [response('acknowledged', { extensionClaimed: true })] }),
      freshProfiles('2026-08-26'),
      at('2026-08-26T00:00:00Z')
    );

    // One month plus the two further months allowed by Art. 12(3).
    expect(result.dueAt).toBe('2026-10-14');
    expect(result.extended).toBe(true);
    expect(result.status).toBe('pending');
  });

  it.each<RequestOutcome>(['completed', 'refused'])('closes the clock on a %s response', (outcome) => {
    const result = computeDeadline(
      request({ responses: [response(outcome)] }),
      freshProfiles('2026-08-26'),
      at('2026-08-26T00:00:00Z')
    );

    expect(result.status).toBe('closed');
  });

  it('keeps the clock running through a non-terminal response', () => {
    const result = computeDeadline(
      request({ responses: [response('identity_required')] }),
      freshProfiles('2026-08-26'),
      at('2026-08-26T00:00:00Z')
    );

    expect(result.status).toBe('overdue');
  });

  it('lets an explicit override win over the computed date', () => {
    const result = computeDeadline(
      request({ dueAtOverride: '2026-09-01T00:00:00.000Z' }),
      freshProfiles('2026-08-26'),
      at('2026-08-26T00:00:00Z')
    );

    expect(result.dueAt).toBe('2026-09-01');
    expect(result.overridden).toBe(true);
    // Six days out, so the override is honoured and still flagged as urgent.
    expect(result.status).toBe('due_soon');
  });

  it('uses CCPA day-based windows without month arithmetic', () => {
    const result = computeDeadline(
      request({ profileId: 'ccpa', basisId: 'ccpa.delete' }),
      freshProfiles('2026-07-20'),
      at('2026-07-20T00:00:00Z')
    );

    expect(result.dueAt).toBe('2026-08-28');
  });

  it('explains the arithmetic behind the date', () => {
    const result = computeDeadline(request(), freshProfiles('2026-07-20'), at('2026-07-20T00:00:00Z'));

    expect(result.explanation).toContain('2026-07-14');
    expect(result.explanation).toContain('1 month');
    expect(result.explanation).toContain('GDPR Art. 17');
    expect(result.explanation).toContain('2026-08-14');
  });

  describe('soft failure', () => {
    it('returns unknown for a profile that is not loaded, rather than throwing', () => {
      const result = computeDeadline(request({ profileId: 'nope' }), freshProfiles('2026-08-26'));

      expect(result.status).toBe('unknown');
      expect(result.dueAt).toBeNull();
      expect(result.explanation).toContain('nope');
    });

    it('returns unknown for a basis the profile does not define', () => {
      const result = computeDeadline(request({ basisId: 'gdpr.art99' }), freshProfiles('2026-08-26'));

      expect(result.status).toBe('unknown');
      expect(result.dueAt).toBeNull();
    });

    it('returns unknown for an unreadable send date', () => {
      const result = computeDeadline(request({ sentAt: 'not-a-date' }), freshProfiles('2026-08-26'));

      expect(result.status).toBe('unknown');
      expect(result.dueAt).toBeNull();
    });

    it('returns unknown for an unreadable override', () => {
      const result = computeDeadline(request({ dueAtOverride: 'whenever' }), freshProfiles('2026-08-26'));

      expect(result.status).toBe('unknown');
    });
  });

  it('marks deadlines from a profile past its review cadence as unverified', () => {
    const stale = COMPLIANCE_PROFILES.map((profile) => ({ ...profile, lastReviewed: '2020-01-01' }));
    const result = computeDeadline(request(), stale, at('2026-08-26T00:00:00Z'));

    expect(result.stale).toBe(true);
    // Still computed — an unverified deadline is more use than none.
    expect(result.dueAt).toBe('2026-08-14');
  });
});

describe('requestsNeedingAttention', () => {
  function vaultWith(requests: RemovalRequest[]): VaultStateV1 {
    return {
      version: 1,
      savedAt: '2026-08-26T00:00:00.000Z',
      activePersonaId: 'p1',
      personas: [{ id: 'p1', name: 'Default', createdAt: '2026-01-01T00:00:00.000Z' }],
      identifiers: [],
      accounts: [],
      connectorInstances: [
        {
          id: 'ci1',
          connectorId: 'broker-x',
          personaId: 'p1',
          state: 'executed',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          evidence: [],
          requests
        }
      ],
      findings: [],
      settings: {}
    };
  }

  it('ranks the most overdue request first and omits settled ones', () => {
    const vault = vaultWith([
      request({ id: 'recent', sentAt: '2026-08-01T00:00:00.000Z' }),
      request({ id: 'ancient', sentAt: '2026-05-01T00:00:00.000Z' }),
      request({ id: 'done', sentAt: '2026-05-01T00:00:00.000Z', responses: [response('completed')] })
    ]);

    const attention = requestsNeedingAttention(vault, freshProfiles('2026-08-26'), at('2026-08-26T00:00:00Z'));

    expect(attention.map((tracked) => tracked.request.id)).toEqual(['ancient', 'recent']);
  });

  it('ignores connector instances that carry no requests', () => {
    const vault = vaultWith([]);
    delete vault.connectorInstances[0]!.requests;

    expect(requestsNeedingAttention(vault, freshProfiles('2026-08-26'))).toEqual([]);
  });
});
