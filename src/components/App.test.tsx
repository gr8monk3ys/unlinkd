import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveIdentifiers } from '../core/storage';
import { App } from './App';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function unlockStorage(): void {
  fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'passphrase' } });
  fireEvent.click(screen.getByRole('button', { name: 'Unlock Storage' }));
}

describe('App', () => {
  it('adds an identifier and updates graph node count', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-0000-0000-000000000001');

    render(<App />);
    unlockStorage();

    expect(await screen.findByText('Storage unlocked')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'email' } });
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Identifier' }));

    expect(await screen.findByText('email: user@example.com')).toBeInTheDocument();
    expect(screen.getByText('Nodes: 1')).toBeInTheDocument();
    expect(await screen.findByText('Entries: 1')).toBeInTheDocument();
  });

  it('requires storage unlock before adding', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Identifier' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Unlock storage before adding identifiers.');
  });

  it('prevents duplicate identifiers', async () => {
    render(<App />);
    unlockStorage();

    expect(await screen.findByText('Storage unlocked')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'username' } });
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'alias' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Identifier' }));
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'alias' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Identifier' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This identifier already exists.');
  });

  it('loads persisted identifiers after unlock', async () => {
    await saveIdentifiers([{ id: 'abc', type: 'username', value: 'alias', sensitivity: 2, consent: true }], 'passphrase');

    render(<App />);
    unlockStorage();

    expect(await screen.findByText('username: alias')).toBeInTheDocument();
  });
});
