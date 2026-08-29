/**
 * Cross-tab coordination.
 *
 * Every vault write is a whole-blob overwrite of shared browser storage, so two
 * unlocked tabs could silently destroy each other's work (last write wins, and
 * the loser never found out). Two mechanisms guard against that:
 *
 * 1. Compare-and-swap in `vault.ts` / `audit.ts` — a write is refused if the
 *    stored ciphertext changed since this tab last read it.
 * 2. This module — tabs announce writes so peers can re-read the vault
 *    immediately instead of drifting until their next save conflicts.
 */

const CHANNEL_NAME = 'unlinkd.vault.sync';

export interface VaultChangedMessage {
  kind: 'vault-changed';
  /** Random per-tab id, so a tab ignores its own broadcasts. */
  origin: string;
}

/** Identifies this tab for the lifetime of the page. */
export const tabId = (() => {
  try {
    return crypto.randomUUID();
  } catch {
    return `tab-${String(Date.now())}`;
  }
})();

function createChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') {
    return null;
  }

  try {
    return new BroadcastChannel(CHANNEL_NAME);
  } catch {
    return null;
  }
}

/** Announce that this tab just wrote the vault. No-op where unsupported. */
export function broadcastVaultChanged(): void {
  const channel = createChannel();
  if (!channel) {
    return;
  }

  try {
    channel.postMessage({ kind: 'vault-changed', origin: tabId } satisfies VaultChangedMessage);
  } catch {
    // Broadcasting is best-effort; the CAS guard is the real protection.
  } finally {
    channel.close();
  }
}

/**
 * Subscribe to vault writes made by *other* tabs. Returns an unsubscribe fn.
 */
export function subscribeVaultChanged(onChanged: () => void): () => void {
  const channel = createChannel();
  if (!channel) {
    return () => undefined;
  }

  function handle(event: MessageEvent): void {
    const data = event.data as Partial<VaultChangedMessage> | null;
    if (data && data.kind === 'vault-changed' && data.origin !== tabId) {
      onChanged();
    }
  }

  channel.addEventListener('message', handle);
  return () => {
    channel.removeEventListener('message', handle);
    channel.close();
  };
}
