import { afterEach, describe, expect, it, vi } from 'vitest';
import { broadcastVaultChanged, subscribeVaultChanged, tabId } from './sync';

const CHANNEL_NAME = 'unlinkd.vault.sync';

// Captured once, up front, so a test that stubs out global BroadcastChannel to
// simulate an unsupported environment can always restore it afterwards.
const RealBroadcastChannel = globalThis.BroadcastChannel;

/** Let queued BroadcastChannel message events flush before asserting. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

describe('sync', () => {
  afterEach(() => {
    // Guard against a test that stubs out globalThis.BroadcastChannel leaking
    // into the next one if an assertion throws before it restores it.
    if (typeof globalThis.BroadcastChannel === 'undefined') {
      globalThis.BroadcastChannel = RealBroadcastChannel;
    }
  });

  it('notifies subscribers when another tab broadcasts a vault change', async () => {
    const onChanged = vi.fn();
    const unsubscribe = subscribeVaultChanged(onChanged);

    const otherTab = new BroadcastChannel(CHANNEL_NAME);
    otherTab.postMessage({ kind: 'vault-changed', origin: 'other-tab' });
    otherTab.close();

    await flush();
    expect(onChanged).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('ignores a broadcast whose origin matches this tab (its own write)', async () => {
    const onChanged = vi.fn();
    const unsubscribe = subscribeVaultChanged(onChanged);

    // Mirrors exactly what this tab's own broadcastVaultChanged() would send.
    const selfEcho = new BroadcastChannel(CHANNEL_NAME);
    selfEcho.postMessage({ kind: 'vault-changed', origin: tabId });
    selfEcho.close();

    await flush();
    expect(onChanged).not.toHaveBeenCalled();

    unsubscribe();
  });

  it('ignores malformed or unrelated messages on the same channel', async () => {
    const onChanged = vi.fn();
    const unsubscribe = subscribeVaultChanged(onChanged);

    const otherTab = new BroadcastChannel(CHANNEL_NAME);
    otherTab.postMessage({ kind: 'something-else', origin: 'other-tab' });
    otherTab.postMessage(null);
    otherTab.postMessage('not-an-object');
    otherTab.close();

    await flush();
    expect(onChanged).not.toHaveBeenCalled();

    unsubscribe();
  });

  it('stops notifying once unsubscribed', async () => {
    const onChanged = vi.fn();
    const unsubscribe = subscribeVaultChanged(onChanged);
    unsubscribe();

    const otherTab = new BroadcastChannel(CHANNEL_NAME);
    otherTab.postMessage({ kind: 'vault-changed', origin: 'other-tab' });
    otherTab.close();

    await flush();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('broadcastVaultChanged reaches a listener on another channel instance', async () => {
    const received: unknown[] = [];
    const listener = new BroadcastChannel(CHANNEL_NAME);
    listener.onmessage = (event) => received.push(event.data);

    broadcastVaultChanged();
    await flush();

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ kind: 'vault-changed', origin: tabId });

    listener.close();
  });

  it('is a safe no-op in an environment without BroadcastChannel support', () => {
    globalThis.BroadcastChannel = undefined as unknown as typeof BroadcastChannel;

    expect(() => broadcastVaultChanged()).not.toThrow();

    const onChanged = vi.fn();
    const unsubscribe = subscribeVaultChanged(onChanged);
    expect(() => unsubscribe()).not.toThrow();
    expect(onChanged).not.toHaveBeenCalled();

    globalThis.BroadcastChannel = RealBroadcastChannel;
  });
});
