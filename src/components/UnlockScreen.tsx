import { useState } from 'react';
import { estimatePassphraseStrength } from '../core/passphrase';
import { BrandMark } from './BrandMark';

export interface UnlockScreenProps {
  vaultPresent: boolean;
  passphrase: string;
  onPassphraseChange: (value: string) => void;
  onUnlock: () => void;
  onCreate: () => void;
  onWipeAndRecreate: () => void;
  error: string | null;
  auditError: string | null;
  notice?: string | null;
}

export function UnlockScreen({
  vaultPresent,
  passphrase,
  onPassphraseChange,
  onUnlock,
  onCreate,
  onWipeAndRecreate,
  error,
  auditError,
  notice = null
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
      <header className="app-header">
        <h1>
          <BrandMark />
          <span>
            unlink<span className="wordmark-d">d</span>
          </span>
        </h1>
      </header>
      <p className="tagline">
        Get yourself removed from the internet — and keep the proof. Work through opt-out
        checklists, capture encrypted evidence of every request, and keep a tamper-evident record
        of what you asked and when. Everything stays on this device.
      </p>

      {notice ? <p role="status">{notice}</p> : null}

      {vaultPresent ? (
        <section>
          <h2 id="unlock-form">Unlock</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onUnlock();
            }}
          >
            <label htmlFor="vault-passphrase">Passphrase</label>
            <input
              id="vault-passphrase"
              type="password"
              value={passphrase}
              onChange={(event) => onPassphraseChange(event.target.value)}
              placeholder="enter passphrase"
              autoComplete="current-password"
              autoFocus
            />
            <button type="submit" className="btn-primary">
              Unlock Storage
            </button>
          </form>

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
              <button type="button" className="btn-danger" onClick={onWipeAndRecreate}>
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
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (canCreate) {
                onCreate();
              }
            }}
          >
            <label htmlFor="vault-passphrase">Passphrase</label>
            <input
              id="vault-passphrase"
              type="password"
              value={passphrase}
              onChange={(event) => onPassphraseChange(event.target.value)}
              placeholder="choose a passphrase"
              aria-describedby="passphrase-strength"
              autoComplete="new-password"
              autoFocus
            />

            <label htmlFor="vault-passphrase-confirm">Confirm passphrase</label>
            <input
              id="vault-passphrase-confirm"
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder="re-enter passphrase"
              autoComplete="new-password"
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

            <button type="submit" className="btn-primary" disabled={!canCreate}>
              Create Vault
            </button>
          </form>
        </section>
      )}

      {error ? <p role="alert">{error}</p> : null}
      {auditError ? <p role="status">{auditError}</p> : null}

      <footer className="app-footer">
        <span>Local-first</span>
        <span className="dot" />
        <span>Encrypted on your device</span>
        <span className="dot" />
        <span>No account, no server, no tracking</span>
      </footer>
    </main>
  );
}
