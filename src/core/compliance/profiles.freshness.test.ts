import { describe, expect, it } from 'vitest';
import { COMPLIANCE_PROFILES, PROFILE_REVIEW_CADENCE_DAYS, profileReviewAgeDays } from './profiles';

/**
 * CI freshness gate for the statutory deadline profiles, alongside the
 * connector gate in src/connectors/catalog.freshness.test.ts. See the
 * "Compliance profiles" section of docs/connector-governance.md.
 *
 * Past PROFILE_REVIEW_CADENCE_DAYS the app already labels deadlines
 * unverified; past the hard ceiling the build fails, so a profile nobody has
 * re-read against the statute in a year cannot keep shipping.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
// Same hard ceiling as connectors; generous to avoid surprising CI.
export const PROFILE_MAX_AGE_DAYS = 365;

describe('compliance profile freshness gate', () => {
  it('sets the hard ceiling beyond the in-app review cadence', () => {
    expect(PROFILE_MAX_AGE_DAYS).toBeGreaterThan(PROFILE_REVIEW_CADENCE_DAYS);
  });

  it('declares a valid ISO lastReviewed date on every shipped profile', () => {
    const invalid = COMPLIANCE_PROFILES.filter(
      (profile) => !ISO_DATE.test(profile.lastReviewed) || !Number.isFinite(Date.parse(profile.lastReviewed))
    );
    expect(invalid.map((profile) => profile.id)).toEqual([]);
  });

  it('has no profile reviewed in the future (a typo would mask staleness)', () => {
    const now = Date.now();
    const future = COMPLIANCE_PROFILES.filter((profile) => Date.parse(profile.lastReviewed) > now);
    expect(future.map((profile) => profile.id)).toEqual([]);
  });

  it('has no profile older than the staleness ceiling', () => {
    const now = Date.now();
    const stale = COMPLIANCE_PROFILES.filter((profile) => {
      const age = profileReviewAgeDays(profile, now);
      return age === null || age > PROFILE_MAX_AGE_DAYS;
    });
    expect(stale.map((profile) => profile.id)).toEqual([]);
  });

  it('cites an https source for every profile so a review can be repeated', () => {
    const unsourced = COMPLIANCE_PROFILES.filter((profile) => !/^https:\/\/\S+$/u.test(profile.sourceUrl));
    expect(unsourced.map((profile) => profile.id)).toEqual([]);
  });
});
