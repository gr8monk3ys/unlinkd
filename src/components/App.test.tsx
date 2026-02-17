import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyVault, saveVault } from '../core/vault';
import { App } from './App';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function unlockStorage(): Promise<void> {
  fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'passphrase' } });
  fireEvent.click(screen.getByRole('button', { name: 'Unlock Storage' }));
  expect(await screen.findByText('Persona: Default')).toBeInTheDocument();
}

async function switchToTab(name: string): Promise<void> {
  fireEvent.click(screen.getByRole('tab', { name }));
  // Wait for lazy-loaded tab content to render
  await screen.findByRole('tabpanel');
}

describe('App', () => {
  it('adds an identifier and updates graph node count', async () => {
    render(<App />);
    await unlockStorage();

    await switchToTab('Identifiers');
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'email' } });
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Identifier' }));

    expect(await screen.findByText('email: user@example.com')).toBeInTheDocument();

    await switchToTab('Dashboard');
    await waitFor(() => expect(screen.getByTestId('stat-identifiers')).toHaveTextContent('1'));
    expect(await screen.findByText('Entries: 1')).toBeInTheDocument();
  });

  it('shows an unlock screen before any vault is unlocked', async () => {
    render(<App />);

    expect(await screen.findByText('Unlock')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlock Storage' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Identifier' })).toBeNull();
  });

  it('prevents duplicate identifiers', async () => {
    render(<App />);
    await unlockStorage();

    await switchToTab('Identifiers');
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'username' } });
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'alias' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Identifier' }));
    expect(await screen.findByText('username: alias')).toBeInTheDocument();

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

  it('loads persisted identifiers after unlock', async () => {
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
    await saveVault(vault, 'passphrase');

    render(<App />);
    await unlockStorage();

    await switchToTab('Identifiers');
    expect(await screen.findByText('username: alias')).toBeInTheDocument();
  });
});
