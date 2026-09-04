/**
 * Statutory response windows, as data.
 *
 * Deadlines are the one thing in this app a user might act on legally, so the
 * regimes live here as reviewable data rather than scattered through the UI.
 * Adding LGPD or Law 25 later should be a new entry, not new code.
 */

/** A specific right a request is made under, with its response window. */
export interface ComplianceBasis {
  /** Stable id, namespaced by profile: 'gdpr.art17'. */
  id: string;
  label: string;
  /** Shown next to every computed deadline so the number is checkable. */
  citation: string;
  responseWindow: ComplianceWindow;
  /** Additional time the controller may take, if it tells you it is doing so. */
  extensionWindow?: ComplianceWindow;
  extensionNote?: string;
}

export interface ComplianceWindow {
  value: number;
  /**
   * Months are calendar months, not 30-day blocks — GDPR Art. 12(3) says "one
   * month", and 31 January plus one month is 28 or 29 February.
   */
  unit: 'days' | 'months';
}

export interface ComplianceProfile {
  id: string;
  name: string;
  jurisdictions: string[];
  bases: ComplianceBasis[];
  /** ISO date (YYYY-MM-DD) the windows were last checked against the statute. */
  lastReviewed: string;
  sourceUrl: string;
}

/**
 * Statutory text moves, and a confidently-wrong deadline is worse than none.
 * Profiles past this age have their deadlines shown as unverified, mirroring
 * the connector review cadence in ../connectors.ts.
 */
export const PROFILE_REVIEW_CADENCE_DAYS = 180;

export const GDPR_PROFILE: ComplianceProfile = {
  id: 'gdpr',
  name: 'GDPR / UK GDPR',
  jurisdictions: ['EU', 'EEA', 'UK'],
  lastReviewed: '2026-08-28',
  sourceUrl: 'https://gdpr-info.eu/art-12-gdpr/',
  bases: [
    {
      id: 'gdpr.art17',
      label: 'Erasure ("right to be forgotten")',
      citation: 'GDPR Art. 17, deadline per Art. 12(3)',
      responseWindow: { value: 1, unit: 'months' },
      extensionWindow: { value: 2, unit: 'months' },
      extensionNote:
        'Art. 12(3) allows two further months for complex requests, but only if the controller tells you within the first month.'
    },
    {
      id: 'gdpr.art15',
      label: 'Access (subject access request)',
      citation: 'GDPR Art. 15, deadline per Art. 12(3)',
      responseWindow: { value: 1, unit: 'months' },
      extensionWindow: { value: 2, unit: 'months' },
      extensionNote: 'Same Art. 12(3) extension, with notice inside the first month.'
    },
    {
      id: 'gdpr.art21',
      label: 'Objection to processing',
      citation: 'GDPR Art. 21, deadline per Art. 12(3)',
      responseWindow: { value: 1, unit: 'months' },
      extensionWindow: { value: 2, unit: 'months' },
      extensionNote: 'Same Art. 12(3) extension, with notice inside the first month.'
    }
  ]
};

export const CCPA_PROFILE: ComplianceProfile = {
  id: 'ccpa',
  name: 'CCPA / CPRA (California)',
  jurisdictions: ['US-CA'],
  lastReviewed: '2026-08-28',
  sourceUrl: 'https://oag.ca.gov/privacy/ccpa',
  bases: [
    {
      id: 'ccpa.delete',
      label: 'Deletion',
      citation: 'Cal. Civ. Code § 1798.105; timing per § 1798.130(a)(2)',
      responseWindow: { value: 45, unit: 'days' },
      extensionWindow: { value: 45, unit: 'days' },
      extensionNote: 'A further 45 days is allowed when reasonably necessary, with notice inside the first 45.'
    },
    {
      id: 'ccpa.know',
      label: 'Right to know',
      citation: 'Cal. Civ. Code § 1798.110; timing per § 1798.130(a)(2)',
      responseWindow: { value: 45, unit: 'days' },
      extensionWindow: { value: 45, unit: 'days' },
      extensionNote: 'A further 45 days is allowed when reasonably necessary, with notice inside the first 45.'
    },
    {
      id: 'ccpa.optout',
      label: 'Opt out of sale or sharing',
      citation: 'Cal. Civ. Code § 1798.120',
      responseWindow: { value: 15, unit: 'days' }
    }
  ]
};

/**
 * California's Delete Request and Opt-out Platform, live since 1 January 2026
 * and enforceable since 1 August 2026.
 *
 * DROP is a different shape from the other regimes here: rather than one
 * request to one operator, a California resident submits a single verified
 * request through the state platform and every registered data broker must act
 * on it. That makes it the highest-leverage single action available to a
 * Californian, and worth tracking as its own basis.
 *
 * The 90-day figure is the composition of two statutory 45-day cycles: a broker
 * must access DROP at least once every 45 days, then process what it downloaded
 * within a further 45 calendar days. Reporting sometimes quotes either number
 * alone; 90 days is the conservative consumer-facing worst case, so it is what
 * the clock uses.
 */
export const CA_DROP_PROFILE: ComplianceProfile = {
  id: 'ca_drop',
  name: 'California DROP (Delete Act)',
  jurisdictions: ['US-CA'],
  lastReviewed: '2026-08-28',
  sourceUrl: 'https://cppa.ca.gov/data_brokers/',
  bases: [
    {
      id: 'ca_drop.deletion',
      label: 'Deletion via the state platform (all registered brokers)',
      citation: 'Cal. Civ. Code § 1798.99.86 (Delete Act); CPPA DROP regulations',
      responseWindow: { value: 90, unit: 'days' },
      extensionNote:
        'Brokers must check DROP at least every 45 days and process each downloaded request within a further 45 days, so 90 days is the outer bound rather than a promise of 90.'
    }
  ]
};

/**
 * The common shape of a US state deletion right, for the ~20 states with a
 * comprehensive privacy law in effect but no central portal.
 *
 * Deliberately generic. Modelling each state separately would mean twenty
 * profiles that nobody re-verifies, and a confidently wrong citation is worse
 * than an openly approximate one — so this says plainly that it is the common
 * pattern and asks the user to confirm their own statute. The per-request
 * deadline override exists for exactly this case.
 */
export const US_STATE_PROFILE: ComplianceProfile = {
  id: 'us_state',
  name: 'US state privacy law (generic — confirm your state)',
  jurisdictions: ['US'],
  lastReviewed: '2026-08-28',
  sourceUrl: 'https://iapp.org/resources/article/us-state-privacy-legislation-tracker/',
  bases: [
    {
      id: 'us_state.delete',
      label: 'Deletion of personal data',
      citation:
        'Common pattern across state comprehensive privacy laws — confirm your own state statute before relying on this date',
      responseWindow: { value: 45, unit: 'days' },
      extensionWindow: { value: 45, unit: 'days' },
      extensionNote:
        'Most state laws allow one further 45-day extension where reasonably necessary, with notice inside the first 45.'
    },
    {
      id: 'us_state.optout',
      label: 'Opt out of sale or targeted advertising',
      citation: 'Common pattern across state comprehensive privacy laws — confirm your own state statute',
      responseWindow: { value: 45, unit: 'days' }
    }
  ]
};

export const COMPLIANCE_PROFILES: ComplianceProfile[] = [
  GDPR_PROFILE,
  CCPA_PROFILE,
  CA_DROP_PROFILE,
  US_STATE_PROFILE
];

export function findProfile(profileId: string, profiles = COMPLIANCE_PROFILES): ComplianceProfile | null {
  return profiles.find((profile) => profile.id === profileId) ?? null;
}

export function findBasis(
  profileId: string,
  basisId: string,
  profiles = COMPLIANCE_PROFILES
): ComplianceBasis | null {
  return findProfile(profileId, profiles)?.bases.find((basis) => basis.id === basisId) ?? null;
}

/** Whole days since a profile's windows were last checked, or null if unknown. */
export function profileReviewAgeDays(
  profile: Pick<ComplianceProfile, 'lastReviewed'>,
  now: number = Date.now()
): number | null {
  const ts = Date.parse(profile.lastReviewed);
  if (!Number.isFinite(ts)) {
    return null;
  }

  return Math.max(0, Math.floor((now - ts) / (24 * 60 * 60 * 1000)));
}

/** True when a profile is past the review cadence, or carries no usable date. */
export function isProfileStale(
  profile: Pick<ComplianceProfile, 'lastReviewed'>,
  now: number = Date.now()
): boolean {
  const age = profileReviewAgeDays(profile, now);
  return age === null || age > PROFILE_REVIEW_CADENCE_DAYS;
}
