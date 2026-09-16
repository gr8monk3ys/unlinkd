import { describe, expect, it } from 'vitest';
import {
  CCPA_PROFILE,
  COMPLIANCE_PROFILES,
  findBasis,
  findProfile,
  GDPR_PROFILE,
  isProfileStale,
  profileReviewAgeDays,
  PROFILE_REVIEW_CADENCE_DAYS
} from './profiles';

describe('compliance profiles', () => {
  it('gives every profile a parseable review date', () => {
    COMPLIANCE_PROFILES.forEach((profile) => {
      expect(Number.isFinite(Date.parse(profile.lastReviewed))).toBe(true);
    });
  });

  it('gives every basis a citation and a positive response window', () => {
    COMPLIANCE_PROFILES.flatMap((profile) => profile.bases).forEach((basis) => {
      expect(basis.citation.length).toBeGreaterThan(0);
      expect(basis.responseWindow.value).toBeGreaterThan(0);
    });
  });

  it('namespaces every basis id under its profile', () => {
    COMPLIANCE_PROFILES.forEach((profile) => {
      profile.bases.forEach((basis) => {
        expect(basis.id.startsWith(`${profile.id}.`)).toBe(true);
      });
    });
  });

  it('gives every basis a unique id across all profiles', () => {
    const ids = COMPLIANCE_PROFILES.flatMap((profile) => profile.bases.map((basis) => basis.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('notes what an extension requires wherever one is offered', () => {
    COMPLIANCE_PROFILES.flatMap((profile) => profile.bases)
      .filter((basis) => basis.extensionWindow)
      .forEach((basis) => {
        expect(basis.extensionNote?.length ?? 0).toBeGreaterThan(0);
      });
  });

  it('models the GDPR window as one calendar month, not thirty days', () => {
    const erasure = findBasis('gdpr', 'gdpr.art17');
    expect(erasure?.responseWindow).toEqual({ value: 1, unit: 'months' });
    expect(erasure?.extensionWindow).toEqual({ value: 2, unit: 'months' });
  });

  it('models the CCPA window as 45 days', () => {
    expect(findBasis('ccpa', 'ccpa.delete')?.responseWindow).toEqual({ value: 45, unit: 'days' });
  });

  it('looks profiles up by id and returns null when absent', () => {
    expect(findProfile('gdpr')).toBe(GDPR_PROFILE);
    expect(findProfile('ccpa')).toBe(CCPA_PROFILE);
    expect(findProfile('lgpd')).toBeNull();
    expect(findBasis('gdpr', 'ccpa.delete')).toBeNull();
  });
});

describe('profile freshness', () => {
  const reviewed = { lastReviewed: '2026-01-01' };
  const day = 24 * 60 * 60 * 1000;

  it('counts whole days since review', () => {
    expect(profileReviewAgeDays(reviewed, Date.parse('2026-01-11T00:00:00Z'))).toBe(10);
  });

  it('never reports a negative age for a future review date', () => {
    expect(profileReviewAgeDays(reviewed, Date.parse('2025-12-01T00:00:00Z'))).toBe(0);
  });

  it('treats an unparseable review date as stale', () => {
    expect(profileReviewAgeDays({ lastReviewed: 'soon' }, Date.now())).toBeNull();
    expect(isProfileStale({ lastReviewed: 'soon' }, Date.now())).toBe(true);
  });

  it('goes stale only past the cadence', () => {
    const justInside = Date.parse('2026-01-01T00:00:00Z') + PROFILE_REVIEW_CADENCE_DAYS * day;
    expect(isProfileStale(reviewed, justInside)).toBe(false);
    expect(isProfileStale(reviewed, justInside + day)).toBe(true);
  });
});
