import { useState } from 'react';
import type { Account, AccountStatus } from '../../core/types';
import { sanitizeHttpUrl } from '../useUnlinkdApp';

const accountStatuses: AccountStatus[] = ['active', 'unused', 'removed', 'unknown'];

interface AccountsTabProps {
  personaAccounts: Account[];
  accountsImportStatus: string | null;
  onAddAccount: (service: string, username: string, url: string, status: AccountStatus) => Promise<boolean>;
  onImportAccounts: (file: File) => void;
  onImportMailbox: (file: File) => void;
}

export function AccountsTab({
  personaAccounts,
  accountsImportStatus,
  onAddAccount,
  onImportAccounts,
  onImportMailbox
}: AccountsTabProps): React.JSX.Element {
  const [accountService, setAccountService] = useState('');
  const [accountUsername, setAccountUsername] = useState('');
  const [accountUrl, setAccountUrl] = useState('');
  const [accountStatus, setAccountStatus] = useState<AccountStatus>('active');

  return (
    <section>
      <h2>Accounts</h2>
      <p>{`Accounts (active persona): ${personaAccounts.length}`}</p>

      <h3>Add Account</h3>
      <label htmlFor="account-service">Service</label>
      <input
        id="account-service"
        value={accountService}
        onChange={(event) => setAccountService(event.target.value)}
        placeholder="e.g. gmail, instagram, bank"
      />
      <label htmlFor="account-username">Username</label>
      <input
        id="account-username"
        value={accountUsername}
        onChange={(event) => setAccountUsername(event.target.value)}
        placeholder="e.g. handle, email, user id"
      />
      <label htmlFor="account-url">URL (optional)</label>
      <input
        id="account-url"
        value={accountUrl}
        onChange={(event) => setAccountUrl(event.target.value)}
        placeholder="https://..."
      />
      <label htmlFor="account-status">Status</label>
      <select
        id="account-status"
        value={accountStatus}
        onChange={(event) => setAccountStatus(event.target.value as AccountStatus)}
      >
        {accountStatuses.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() =>
          void onAddAccount(accountService, accountUsername, accountUrl, accountStatus).then((ok) => {
            if (ok) {
              setAccountService('');
              setAccountUsername('');
              setAccountUrl('');
              setAccountStatus('active');
            }
          })
        }
      >
        Add Account
      </button>

      <h3>Import Accounts CSV</h3>
      <p>Auto-detects common exports (Bitwarden, 1Password, LastPass, Chrome) or generic `service`/`username` CSV.</p>
      <label>
        CSV file
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            // Reset so selecting the same file again re-fires the change event.
            event.target.value = '';
            if (file) {
              onImportAccounts(file);
            }
          }}
        />
      </label>
      {accountsImportStatus ? <p role="status">{accountsImportStatus}</p> : null}

      <h3>Mailbox Discovery (.mbox)</h3>
      <p>Extracts candidate accounts from `From` + `Delivered-To`/`To` headers (best for small exports).</p>
      <label>
        Mbox file
        <input
          type="file"
          accept=".mbox,text/plain"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = '';
            if (file) {
              onImportMailbox(file);
            }
          }}
        />
      </label>

      <h3>Account List</h3>
      <ul>
        {personaAccounts.map((account) => (
          <li key={account.id}>
            <strong>{account.service}</strong>
            <span>{` @ ${account.username}`}</span>
            <span>{` (${account.status})`}</span>
            {account.lastSeenAt ? <span>{` last seen ${account.lastSeenAt}`}</span> : null}
            {(() => {
              // Defense in depth: even if a non-http(s) URL reached the vault
              // (e.g. via an old import), never render it as a clickable link.
              const safeUrl = account.url ? sanitizeHttpUrl(account.url) : null;
              return safeUrl ? (
                <a href={safeUrl} target="_blank" rel="noreferrer noopener">
                  Open
                </a>
              ) : null;
            })()}
          </li>
        ))}
      </ul>
      {personaAccounts.length === 0 ? <p>(none)</p> : null}
    </section>
  );
}
