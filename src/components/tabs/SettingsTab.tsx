import { useState } from 'react';
import type { ManualCheckSuggestion } from '../../core/hibp';

export interface SettingsTabProps {
  hibpApiKey: string;
  /** Resolves true only when the key was actually persisted to the vault. */
  onSaveHibpApiKey: (key: string) => Promise<boolean>;
  /** Returns the number of times the password appeared in breaches, or null on error. */
  onCheckPassword: (password: string) => Promise<number | null>;
  manualSuggestions: ManualCheckSuggestion[];
}

export function SettingsTab({
  hibpApiKey,
  onSaveHibpApiKey,
  onCheckPassword,
  manualSuggestions
}: SettingsTabProps): React.JSX.Element {
  const [apiKeyInput, setApiKeyInput] = useState(hibpApiKey);
  const [apiKeySaved, setApiKeySaved] = useState<'saved' | 'failed' | null>(null);

  const [password, setPassword] = useState('');
  const [checking, setChecking] = useState(false);
  const [pwnedCount, setPwnedCount] = useState<number | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  async function handleSaveApiKey(): Promise<void> {
    setApiKeySaved(null);
    const saved = await onSaveHibpApiKey(apiKeyInput.trim());
    setApiKeySaved(saved ? 'saved' : 'failed');
  }

  async function handleCheckPassword(): Promise<void> {
    if (!password) {
      return;
    }

    setChecking(true);
    setCheckError(null);
    setChecked(false);
    try {
      const count = await onCheckPassword(password);
      if (count === null) {
        setCheckError('Unable to reach the Pwned Passwords service. Try again later.');
        setPwnedCount(null);
      } else {
        setPwnedCount(count);
        setChecked(true);
      }
    } finally {
      // Never retain the password in component state after a check.
      setPassword('');
      setChecking(false);
    }
  }

  return (
    <section>
      <h2>Settings</h2>

      <section aria-labelledby="hibp-key-heading">
        <h3 id="hibp-key-heading">Have I Been Pwned API key</h3>
        <p>
          Optional. Adding a paid HIBP API key lets local scans automatically check your email
          identifiers against known breaches. The key is stored encrypted in your local vault and is
          only sent to haveibeenpwned.com.
        </p>
        <label htmlFor="hibp-api-key">API key</label>
        <input
          id="hibp-api-key"
          type="password"
          value={apiKeyInput}
          placeholder="hibp-api-key"
          onChange={(event) => {
            setApiKeyInput(event.target.value);
            setApiKeySaved(null);
          }}
        />
        <button type="button" onClick={() => void handleSaveApiKey()}>
          Save API Key
        </button>
        {apiKeySaved === 'saved' ? <p role="status">API key saved to vault.</p> : null}
        {apiKeySaved === 'failed' ? (
          <p role="alert">The API key was not saved — see the error above and try again.</p>
        ) : null}
      </section>

      <section aria-labelledby="password-check-heading">
        <h3 id="password-check-heading">Password breach check (free)</h3>
        <p>
          Check whether a password has appeared in known breaches. Uses the k-anonymity model: only
          the first 5 characters of the SHA-1 hash are sent, never the password itself.
        </p>
        <label htmlFor="password-check">Password</label>
        <input
          id="password-check"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="button" onClick={() => void handleCheckPassword()} disabled={checking || !password}>
          {checking ? 'Checking…' : 'Check Password'}
        </button>
        {checkError ? <p role="alert">{checkError}</p> : null}
        {checked && pwnedCount !== null ? (
          <p role="status">
            {pwnedCount === 0
              ? 'Good news — this password was not found in known breaches.'
              : `This password appeared in known breaches ${pwnedCount.toLocaleString()} time(s). Do not use it.`}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="manual-suggestions-heading">
        <h3 id="manual-suggestions-heading">Manual exposure checks</h3>
        {manualSuggestions.length === 0 ? (
          <p>Add consented identifiers to see suggested manual exposure checks.</p>
        ) : (
          <ul>
            {manualSuggestions.map((suggestion, index) => (
              <li key={`${suggestion.service}-${suggestion.identifier.type}-${index}`}>
                <strong>{suggestion.service}</strong>
                {` (${suggestion.identifier.type})`}
                <p>{suggestion.description}</p>
                <a href={suggestion.url} target="_blank" rel="noreferrer noopener">
                  {suggestion.url}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
