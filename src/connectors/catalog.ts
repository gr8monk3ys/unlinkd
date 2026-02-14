import type { ConnectorDefinition } from '../core/types';

export const connectorCatalog: ConnectorDefinition[] = [
  {
    id: 'broker-whitepages',
    name: 'Whitepages (Opt-out)',
    category: 'broker',
    description: 'Guided opt-out workflow for removing public listing entries.',
    defaultRecheckDays: 45,
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
          'Re-check the listing URL(s). If still present, record the current status and escalate using the provider’s support channel.',
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
        instructions:
          'Use first-party deletion/deactivation workflows. Capture proof and schedule a recheck.',
        evidenceHint: 'Deletion confirmation'
      }
    ]
  }
];

export function getConnectorDefinition(connectorId: string): ConnectorDefinition | null {
  return connectorCatalog.find((connector) => connector.id === connectorId) ?? null;
}

