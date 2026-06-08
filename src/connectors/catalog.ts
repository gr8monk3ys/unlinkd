import type { ConnectorDefinition } from '../core/types';

export const builtinConnectorCatalogVersion = 'builtin-2026-02-14';

// Small builtin fallback so the app still works if the connector feed can't be loaded.
export const builtinConnectorCatalog: ConnectorDefinition[] = [
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

