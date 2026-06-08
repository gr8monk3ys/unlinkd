import { useState } from 'react';
import { estimatePassphraseStrength } from '../core/passphrase';

export interface UnlockScreenProps {
  vaultPresent: boolean;
  passphrase: string;
  onPassphraseChange: (value: string) => void;
  onUnlock: () => void;
  onCreate: () => void;
  onWipeAndRecreate: () => void;
  error: string | null;
  auditError: string | null;
}

export function UnlockScreen({
  vaultPresent,
  passphrase,
  onPassphraseChange,
  onUnlock,
  onCreate,
  onWipeAndRecreate,
  error,
  auditError
}: UnlockScreenProps): React.JSX.Element {
  const [confirm, setConfirm] = useState('');
  const [showWipe, setShowWipe] = useState(false);

  const strength = estimatePassphraseStrength(passphrase);
  const matches = passphrase.length > 0 && passphrase === confirm;
  const canCreate = strength.acceptable && matches;

  return (
    <main>
      <a href="#unlock-form" className="skip-link">
        Skip to content
      </a>
      <h1>unlinkd</h1>
      <p>Local-first digital disappearance workflows and OSINT self-scan tooling.</p>

      {vaultPresent ? (
        <section>
          <h2 id="unlock-form">Unlock</h2>
          <label htmlFor="vault-passphrase">Passphrase</label>
          <input
            id="vault-passphrase"
            type="password"
            value={passphrase}
            onChange={(event) => onPassphraseChange(event.target.value)}
            placeholder="enter passphrase"
          />
          <button type="button" onClick={onUnlock}>
            Unlock Storage
          </button>

          <p>
            <button type="button" onClick={() => setShowWipe((value) => !value)}>
              Forgot passphrase?
            </button>
          </p>
          {showWipe ? (
            <div role="region" aria-label="Reset vault">
              <p role="alert">
                There is no passphrase recovery. The vault is encrypted locally and cannot be opened
                without the correct passphrase. You can wipe all local data and start over — this
                permanently destroys the current vault, audit log, and evidence.
              </p>
              <button type="button" onClick={onWipeAndRecreate}>
                Wipe All Data and Start Over
              </button>
            </div>
          ) : null}
        </section>
      ) : (
        <section>
          <h2 id="unlock-form">Create Vault</h2>
          <p>
            Choose a strong passphrase. It encrypts everything stored locally and cannot be
            recovered if lost — there is no reset.
          </p>
          <label htmlFor="vault-passphrase">Passphrase</label>
          <input
            id="vault-passphrase"
            type="password"
            value={passphrase}
            onChange={(event) => onPassphraseChange(event.target.value)}
            placeholder="choose a passphrase"
            aria-describedby="passphrase-strength"
          />

          <label htmlFor="vault-passphrase-confirm">Confirm passphrase</label>
          <input
            id="vault-passphrase-confirm"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder="re-enter passphrase"
          />

          <p id="passphrase-strength">
            <meter
              min={0}
              max={4}
              value={strength.score}
              aria-label="Passphrase strength"
              aria-valuetext={strength.label}
            />
            {` Strength: ${strength.label}`}
          </p>
          {passphrase.length > 0 && strength.suggestions.length > 0 ? (
            <ul aria-label="Passphrase suggestions">
              {strength.suggestions.map((suggestion) => (
                <li key={suggestion}>{suggestion}</li>
              ))}
            </ul>
          ) : null}
          {confirm.length > 0 && !matches ? <p role="alert">Passphrases do not match.</p> : null}

          <button type="button" onClick={onCreate} disabled={!canCreate}>
            Create Vault
          </button>
        </section>
      )}

      {error ? <p role="alert">{error}</p> : null}
      {auditError ? <p role="status">{auditError}</p> : null}
    </main>
  );
}
