import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendAuditRecord, clearAuditCiphertext } from '../core/audit';
import { createEmptyVault, saveVault } from '../core/vault';
import { App } from './App';

const STRONG = 'correct-horse-staple-9';
const originalFetch = globalThis.fetch;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

async function createVault(passphrase = STRONG): Promise<void> {
  fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: passphrase } });
  fireEvent.change(screen.getByLabelText('Confirm passphrase'), { target: { value: passphrase } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Vault' }));
  expect(await screen.findByText('Persona: Default')).toBeInTheDocument();
}

async function unlock(passphrase = STRONG): Promise<void> {
  fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: passphrase } });
  fireEvent.click(screen.getByRole('button', { name: 'Unlock Storage' }));
  expect(await screen.findByText('Persona: Default')).toBeInTheDocument();
}

async function switchToTab(name: string): Promise<void> {
  fireEvent.click(screen.getByRole('tab', { name }));
  // Wait for lazy-loaded tab content to render
  await screen.findByRole('tabpanel');
}

async function addIdentifier(type: string, value: string): Promise<void> {
  await switchToTab('Identifiers');
  fireEvent.change(screen.getByLabelText('Type'), { target: { value: type } });
  fireEvent.change(screen.getByLabelText('Value'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Add Identifier' }));
  expect(await screen.findByText(`${type}: ${value}`)).toBeInTheDocument();
}

describe('App unlock + create', () => {
  it('shows the create-vault screen when no vault exists', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Create Vault' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlock Storage' })).toBeNull();
  });

  it('disables vault creation until the passphrase is strong and confirmed', async () => {
    render(<App />);
    const create = await screen.findByRole('button', { name: 'Create Vault' });
    expect(create).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'weak' } });
    expect(create).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: STRONG } });
    fireEvent.change(screen.getByLabelText('Confirm passphrase'), { target: { value: 'different' } });
    expect(create).toBeDisabled();
    expect(screen.getByText('Passphrases do not match.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Confirm passphrase'), { target: { value: STRONG } });
    expect(create).toBeEnabled();
  });

  it('shows the unlock screen and rejects an incorrect passphrase', async () => {
    await saveVault(createEmptyVault(), STRONG);

    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Unlock' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'wrong-passphrase' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock Storage' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Incorrect passphrase/);
    expect(screen.queryByText('Persona: Default')).toBeNull();
  });

  it('unlocks an existing vault with the correct passphrase', async () => {
    const vault = createEmptyVault();
    vault.identifiers.push({
      id: 'abc',
      personaId: vault.activePersonaId,
      type: 'username',
      value: 'alias',
      sensitivity: 2,
      consent: true,
      createdAt: new Date().toISOString()
    });
    await saveVault(vault, STRONG);

    render(<App />);
    await unlock();

    await switchToTab('Identifiers');
    expect(await screen.findByText('username: alias')).toBeInTheDocument();
  });

  it('flags a wholesale-deleted audit log as tampered, even though the vault itself is untouched', async () => {
    // Build the state an attacker leaves behind after deleting the entire
    // audit blob (a separate localStorage key from the vault) without
    // touching the vault: the vault still remembers a chain tip that no
    // longer appears anywhere in the (now-empty) audit log.
    const record = await appendAuditRecord('identifier_added', 'email:hash', STRONG);
    const vault = createEmptyVault();
    vault.auditChainTip = { id: record!.id, hash: record!.hash };
    await saveVault(vault, STRONG);
    clearAuditCiphertext();

    render(<App />);
    await unlock();

    expect(
      await screen.findByText(/audit log appears to have been reset or deleted/i)
    ).toBeInTheDocument();
  });
});

describe('App identifiers', () => {
  it('adds an identifier and updates graph node count', async () => {
    render(<App />);
    await createVault();

    await addIdentifier('email', 'user@example.com');

    await switchToTab('Dashboard');
    await waitFor(() => expect(screen.getByTestId('stat-identifiers')).toHaveTextContent('1'));
    expect(await screen.findByText('Entries: 1')).toBeInTheDocument();
  });

  it('prevents duplicate identifiers', async () => {
    render(<App />);
    await createVault();

    await addIdentifier('username', 'alias');

    // Wait for the async audit write to complete (busy guard blocks re-entrancy).
    await switchToTab('Dashboard');
    expect(await screen.findByText('Entries: 1')).toBeInTheDocument();
    await switchToTab('Identifiers');
    await waitFor(() => expect((screen.getByLabelText('Value') as HTMLInputElement).value).toBe(''));
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'username' } });
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'alias' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Identifier' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This identifier already exists in this persona.');
  });
});

describe('App findings lifecycle', () => {
  it('runs a local scan and lets a finding be marked mitigated', async () => {
    render(<App />);
    await createVault();

    await addIdentifier('email', 'user@example.com');

    await switchToTab('Dashboard');
    // Wait for the identifier_added audit write to release the busy guard
    // before triggering the scan (otherwise the scan is a no-op).
    expect(await screen.findByText('Entries: 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Run Local Scan' }));
    // Wait for the scan_ran audit write so the busy guard is released before
    // the next action (otherwise marking the finding is a no-op).
    expect(await screen.findByText('Entries: 2')).toBeInTheDocument();

    await switchToTab('Findings');
    expect(await screen.findByText(/consider using an alias/)).toBeInTheDocument();
    expect(screen.getByText(/status: Open/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mitigated' }));
    expect(await screen.findByText(/status: Mitigated/)).toBeInTheDocument();

    // Dashboard open-findings count should drop to zero.
    await switchToTab('Dashboard');
    await waitFor(() => expect(screen.getByTestId('stat-findings')).toHaveTextContent('0'));
  });
});

describe('App settings (HIBP)', () => {
  it('saves the HIBP API key encrypted in the vault', async () => {
    render(<App />);
    await createVault();

    await switchToTab('Settings');
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'my-secret-hibp-key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save API Key' }));

    expect(await screen.findByText('API key saved to vault.')).toBeInTheDocument();
    // The persisted vault ciphertext must not contain the plaintext key.
    await waitFor(() => {
      expect(localStorage.getItem('unlinkd.vault.v1')).not.toContain('my-secret-hibp-key');
    });
  });

  it('checks a password against the (mocked) Pwned Passwords service', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:1\n')
    }) as unknown as typeof fetch;

    render(<App />);
    await createVault();

    await switchToTab('Settings');
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'an-unlikely-password-xyz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check Password' }));

    expect(await screen.findByText(/not found in known breaches/)).toBeInTheDocument();
  });
});
