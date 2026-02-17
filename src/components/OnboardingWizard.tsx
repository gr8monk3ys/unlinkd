import { useState } from 'react';
import type { IdentifierType } from '../core/types';

interface OnboardingWizardProps {
  onAddIdentifiers: (identifiers: Array<{ type: IdentifierType; value: string }>) => Promise<void>;
  onImportAccounts: (file: File) => void;
  onAddConnectors: (connectorIds: string[]) => void;
  onComplete: () => void;
}

type Step = 1 | 2 | 3 | 4 | 5;

const TOTAL_STEPS = 5;

interface IdentifierInputs {
  email: string;
  phone: string;
  legalName: string;
  username: string;
}

interface SuggestedConnector {
  id: string;
  name: string;
  reason: string;
}

function buildSuggestions(identifiers: IdentifierInputs): SuggestedConnector[] {
  const suggestions: SuggestedConnector[] = [];

  if (identifiers.phone.trim()) {
    suggestions.push({
      id: 'other-sim-swap-protection',
      name: 'SIM Swap Protection (Carrier Lock)',
      reason: 'You provided a phone number -- protect it from SIM swap attacks.'
    });
  }

  if (identifiers.email.trim()) {
    suggestions.push({
      id: 'search-google',
      name: 'Google Search (Self-Search + Tracking)',
      reason: 'Search for your email and identifiers across the web.'
    });
  }

  // Always suggest data broker opt-outs when any identifier is present
  if (identifiers.legalName.trim() || identifiers.phone.trim() || identifiers.email.trim()) {
    suggestions.push(
      {
        id: 'broker-whitepages',
        name: 'Whitepages (Opt-out)',
        reason: 'Remove your public listing from Whitepages.'
      },
      {
        id: 'broker-spokeo',
        name: 'Spokeo (Opt-out)',
        reason: 'Remove your profile from Spokeo.'
      },
      {
        id: 'broker-beenverified',
        name: 'BeenVerified (Opt-out)',
        reason: 'Remove your listing from BeenVerified.'
      }
    );
  }

  // Always suggest these regardless of input
  suggestions.push(
    {
      id: 'other-credit-freeze-us',
      name: 'US Credit Freeze (Experian/Equifax/TransUnion)',
      reason: 'Prevent unauthorized credit applications in your name.'
    },
    {
      id: 'other-email-aliasing',
      name: 'Email Aliasing + Dedicated Inboxes',
      reason: 'Reduce linkability by using unique email aliases per service.'
    }
  );

  return suggestions;
}

function StepIndicator({ current, total }: { current: Step; total: number }): React.JSX.Element {
  return (
    <p aria-live="polite">
      {`Step ${current} of ${total}`}
    </p>
  );
}

export function OnboardingWizard({
  onAddIdentifiers,
  onImportAccounts,
  onAddConnectors,
  onComplete
}: OnboardingWizardProps): React.JSX.Element {
  const [step, setStep] = useState<Step>(1);
  const [identifiers, setIdentifiers] = useState<IdentifierInputs>({
    email: '',
    phone: '',
    legalName: '',
    username: ''
  });
  const [importFile, setImportFile] = useState<File | null>(null);
  const [selectedConnectors, setSelectedConnectors] = useState<Set<string>>(new Set());
  const [identifiersAdded, setIdentifiersAdded] = useState(false);
  const [accountsImported, setAccountsImported] = useState(false);
  const [connectorsAdded, setConnectorsAdded] = useState<string[]>([]);

  function goToStep(next: Step): void {
    setStep(next);
  }

  async function handleAddIdentifiers(): Promise<void> {
    const items: Array<{ type: IdentifierType; value: string }> = [];

    if (identifiers.email.trim()) {
      items.push({ type: 'email', value: identifiers.email.trim() });
    }
    if (identifiers.phone.trim()) {
      items.push({ type: 'phone', value: identifiers.phone.trim() });
    }
    if (identifiers.legalName.trim()) {
      items.push({ type: 'legal_name', value: identifiers.legalName.trim() });
    }
    if (identifiers.username.trim()) {
      items.push({ type: 'username', value: identifiers.username.trim() });
    }

    if (items.length > 0) {
      await onAddIdentifiers(items);
      setIdentifiersAdded(true);
    }

    goToStep(3);
  }

  function handleImportAccounts(): void {
    if (importFile) {
      onImportAccounts(importFile);
      setAccountsImported(true);
    }

    goToStep(4);
  }

  function handleAddConnectors(): void {
    const ids = [...selectedConnectors];
    if (ids.length > 0) {
      onAddConnectors(ids);
      setConnectorsAdded(ids);
    }

    goToStep(5);
  }

  function handleToggleConnector(connectorId: string): void {
    setSelectedConnectors((prev) => {
      const next = new Set(prev);
      if (next.has(connectorId)) {
        next.delete(connectorId);
      } else {
        next.add(connectorId);
      }
      return next;
    });
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0] ?? null;
    setImportFile(file);
  }

  const suggestions = buildSuggestions(identifiers);

  return (
    <div data-step={step}>
      <StepIndicator current={step} total={TOTAL_STEPS} />

      {step === 1 ? (
        <section>
          <h2>Welcome to unlinkd</h2>
          <p>
            unlinkd helps you discover and reduce your digital exposure.
            Your data never leaves your device.
          </p>
          <p>
            Your passphrase protects an encrypted local vault where all your identifiers,
            accounts, and evidence are stored. Nothing is sent to any server -- everything
            stays on your machine.
          </p>
          <button type="button" onClick={() => goToStep(2)}>
            Get Started
          </button>
        </section>
      ) : null}

      {step === 2 ? (
        <section>
          <h2>Quick Identity Scan</h2>
          <p>
            These identifiers help us find your exposure across data brokers and services.
            Only the email field is recommended -- the rest are optional.
          </p>

          <div>
            <label htmlFor="onboarding-email">Primary email</label>
            <input
              id="onboarding-email"
              type="email"
              value={identifiers.email}
              onChange={(e) => setIdentifiers((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="onboarding-phone">Phone number (optional)</label>
            <input
              id="onboarding-phone"
              type="tel"
              value={identifiers.phone}
              onChange={(e) => setIdentifiers((prev) => ({ ...prev, phone: e.target.value }))}
              placeholder="+1 555-123-4567"
            />
          </div>

          <div>
            <label htmlFor="onboarding-legal-name">Legal name (optional)</label>
            <input
              id="onboarding-legal-name"
              type="text"
              value={identifiers.legalName}
              onChange={(e) => setIdentifiers((prev) => ({ ...prev, legalName: e.target.value }))}
              placeholder="Jane Doe"
            />
          </div>

          <div>
            <label htmlFor="onboarding-username">Primary username (optional)</label>
            <input
              id="onboarding-username"
              type="text"
              value={identifiers.username}
              onChange={(e) => setIdentifiers((prev) => ({ ...prev, username: e.target.value }))}
              placeholder="janedoe42"
            />
          </div>

          <button type="button" onClick={() => void handleAddIdentifiers()}>
            Add These
          </button>
          <button type="button" onClick={() => goToStep(3)}>
            Skip
          </button>
        </section>
      ) : null}

      {step === 3 ? (
        <section>
          <h2>Import Accounts</h2>
          <p>
            You can import accounts from a password manager CSV export. Supported formats
            include Bitwarden, 1Password, LastPass, and Chrome.
          </p>
          <p>
            This helps unlinkd understand which services you use so it can suggest
            relevant hardening and opt-out workflows.
          </p>

          <div>
            <label htmlFor="onboarding-import-file">Password manager CSV</label>
            <input
              id="onboarding-import-file"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
            />
          </div>

          <button type="button" onClick={handleImportAccounts}>
            Import
          </button>
          <button type="button" onClick={() => goToStep(4)}>
            Skip
          </button>
        </section>
      ) : null}

      {step === 4 ? (
        <section>
          <h2>Suggested Actions</h2>
          <p>
            Based on the information you provided, here are some recommended workflows
            to reduce your digital exposure. Select the ones you want to add.
          </p>

          <fieldset>
            <legend>Available connectors</legend>
            {suggestions.map((suggestion) => (
              <div key={suggestion.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selectedConnectors.has(suggestion.id)}
                    onChange={() => handleToggleConnector(suggestion.id)}
                  />
                  <strong>{suggestion.name}</strong>
                  {' -- '}
                  {suggestion.reason}
                </label>
              </div>
            ))}
          </fieldset>

          <button type="button" onClick={handleAddConnectors}>
            Add Selected
          </button>
          <button type="button" onClick={() => goToStep(5)}>
            Skip
          </button>
        </section>
      ) : null}

      {step === 5 ? (
        <section>
          <h2>Setup Complete</h2>
          <p>Here is a summary of what was configured:</p>
          <ul>
            {identifiersAdded ? (
              <li>
                Identifiers added:
                {' '}
                {[
                  identifiers.email.trim() ? 'email' : '',
                  identifiers.phone.trim() ? 'phone' : '',
                  identifiers.legalName.trim() ? 'legal name' : '',
                  identifiers.username.trim() ? 'username' : ''
                ]
                  .filter(Boolean)
                  .join(', ')}
              </li>
            ) : (
              <li>No identifiers added (you can add them later from the Identifiers tab).</li>
            )}
            {accountsImported ? (
              <li>Accounts imported from CSV.</li>
            ) : (
              <li>No accounts imported (you can import them later from the Accounts tab).</li>
            )}
            {connectorsAdded.length > 0 ? (
              <li>{`${connectorsAdded.length} connector workflow${connectorsAdded.length === 1 ? '' : 's'} added.`}</li>
            ) : (
              <li>No connectors added (you can add them later from the Connectors tab).</li>
            )}
          </ul>
          <button type="button" onClick={onComplete}>
            Go to Dashboard
          </button>
        </section>
      ) : null}
    </div>
  );
}
