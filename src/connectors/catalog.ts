import type { ConnectorDefinition } from '../core/types';

export const builtinConnectorCatalogVersion = 'builtin-2026-08-28';

/** Provenance/verification metadata for the active connector catalog. */
export interface ConnectorCatalogMeta {
  source: 'builtin' | 'cache' | 'remote' | 'import';
  catalogVersion: string;
  generatedAt: string | null;
  verified: boolean | null;
  updatedAt: string | null;
  error: string | null;
}

// Small builtin fallback so the app still works if the connector feed can't be loaded.
export const builtinConnectorCatalog: ConnectorDefinition[] = [
  // First deliberately: for a California resident this single request reaches
  // every registered broker, so it outranks any individual opt-out below.
  {
    id: 'ca-drop-deletion',
    name: 'California DROP (delete from every registered broker)',
    category: 'broker',
    description: 'One verified request through California\'s state platform directs every registered data broker to delete your personal information. Enforceable since 1 August 2026. If you are a California resident this is the highest-leverage action available — it reaches 500+ brokers at once, where an individual opt-out reaches one.',
    defaultRecheckDays: 45,
    lastReviewed: '2026-08-28',
    jurisdictions: [
      'US-CA'
    ],
    steps: [
      {
        id: 'eligibility',
        type: 'manual',
        title: 'Confirm you are a California resident',
        instructions: 'DROP is open to California residents only, and the state verifies residency as part of submission. If you are not a Californian, skip this connector and use the per-broker opt-outs (and, in the EU/UK, a GDPR Art. 17 erasure request).',
        evidenceHint: 'No evidence needed for this step'
      },
      {
        id: 'submit',
        type: 'manual',
        title: 'Submit the deletion request at privacy.ca.gov',
        instructions: 'Go to privacy.ca.gov and open the Delete Request and Opt-out Platform. Create a profile, complete the state\'s residency verification, and choose how much identifying information to share — you control how much you provide, and more information helps brokers match your records. Submit the deletion request. Capture the confirmation screen.',
        evidenceHint: 'Screenshot of the submission confirmation'
      },
      {
        id: 'record',
        type: 'manual',
        title: 'Record the request against the 90-day clock',
        instructions: 'In the Removal requests panel below, record this request under the \'California DROP (Delete Act)\' regime so the deadline is tracked. Brokers must check DROP at least every 45 days and process what they download within a further 45, so 90 days is the outer bound.',
        evidenceHint: 'Submission reference or date'
      },
      {
        id: 'status',
        type: 'manual',
        title: 'Check deletion status on the platform',
        instructions: 'DROP reports per-broker status back to you. Re-open your profile, review which brokers have acted, and capture the status view. Non-compliance after the deadline is enforceable by the CPPA at $200 per request per day, so a dated record of the gap is worth keeping.',
        evidenceHint: 'Screenshot of the platform status view'
      },
      {
        id: 'recheck',
        type: 'manual',
        title: 'Re-check on the next cycle',
        instructions: 'Deletion is an ongoing obligation: a broker that re-acquires your data must delete it again on the following cycle. Re-check status roughly every 45 days and capture fresh evidence when anything changes.',
        evidenceHint: 'Dated status screenshot'
      }
    ]
  },
  {
    id: 'broker-whitepages',
    name: 'Whitepages (Opt-out)',
    category: 'broker',
    description: 'Guided opt-out workflow for removing public listing entries.',
    defaultRecheckDays: 45,
    lastReviewed: '2026-06-08',
    steps: [
      {
        id: 'search',
        type: 'manual',
        title: 'Search for your listing',
        instructions:
          'Search Whitepages for your name/phone/address. Capture the listing URL(s) and any record IDs.',
        evidenceHint: 'Screenshot or URL note'
      },
      {
        id: 'submit',
        type: 'manual',
        title: 'Submit opt-out request',
        instructions:
          'Submit the opt-out form using the least-privilege proof required. Prefer a dedicated inbox/number for verification if possible.',
        evidenceHint: 'Confirmation email/screenshot'
      },
      {
        id: 'verify',
        type: 'manual',
        title: 'Verify removal',
        instructions:
          "Re-check the listing URL(s). If still present, record the current status and escalate using the provider's support channel.",
        evidenceHint: 'Before/after screenshots'
      }
    ]
  },
  {
    id: 'search-google',
    name: 'Google Search (Self-Search + Tracking)',
    category: 'search',
    description: 'Track top exposed queries and URLs for your identifiers.',
    defaultRecheckDays: 30,
    lastReviewed: '2026-06-08',
    steps: [
      {
        id: 'queries',
        type: 'manual',
        title: 'Run self-search queries',
        instructions:
          'Search for your name variants, usernames, emails, phone number, and address. Record URLs that expose or link your identifiers.',
        evidenceHint: 'URL list + screenshots'
      },
      {
        id: 'prioritize',
        type: 'manual',
        title: 'Prioritize removals',
        instructions:
          'Prioritize URLs by harm and exploitability. Focus on high-risk pages (addresses, phone, doxxing, recovery vectors).',
        evidenceHint: 'Notes'
      }
    ]
  },
  {
    id: 'account-facebook',
    name: 'Facebook (Account Minimization)',
    category: 'account',
    description: 'Checklist for hardening or deleting a Facebook account.',
    defaultRecheckDays: 90,
    lastReviewed: '2026-06-08',
    steps: [
      {
        id: 'mfa',
        type: 'manual',
        title: 'Enable phishing-resistant MFA if available',
        instructions:
          'Prefer passkeys or hardware keys. If not available, enable TOTP and remove SMS recovery where possible.',
        evidenceHint: 'Settings screenshot'
      },
      {
        id: 'minimize',
        type: 'manual',
        title: 'Minimize profile data',
        instructions:
          'Remove public fields (phone, address, employer, education). Tighten privacy settings and review connected apps.',
        evidenceHint: 'Settings screenshot'
      },
      {
        id: 'delete',
        type: 'manual',
        title: 'Delete or deactivate (if desired)',
        instructions: 'Use first-party deletion/deactivation workflows. Capture proof and schedule a recheck.',
        evidenceHint: 'Deletion confirmation'
      }
    ]
  }
];

export function mergeConnectorCatalogs(
  builtin: ConnectorDefinition[],
  overrides: ConnectorDefinition[]
): ConnectorDefinition[] {
  const merged = new Map<string, ConnectorDefinition>();
  builtin.forEach((def) => merged.set(def.id, def));
  overrides.forEach((def) => merged.set(def.id, def));
  return [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function getConnectorDefinition(
  connectorId: string,
  catalog: ConnectorDefinition[]
): ConnectorDefinition | null {
  return catalog.find((connector) => connector.id === connectorId) ?? null;
}
