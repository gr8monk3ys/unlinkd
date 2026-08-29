import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { setScryptParamsForTesting } from '../core/crypto';
import { resetVaultSyncState } from '../core/vault';

// Use a trivial scrypt work factor in tests so the suite stays fast. Production
// uses DEFAULT_SCRYPT_PARAMS; correctness (not work factor) is what we assert.
setScryptParamsForTesting({ N: 2 ** 8, r: 8, p: 1 });

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) ?? null) : null;
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

const memoryStorage = new MemoryStorage();

function installStorage(target: object): void {
  Object.defineProperty(target, 'localStorage', {
    value: memoryStorage,
    configurable: true,
    enumerable: true,
    writable: true
  });
}

beforeEach(() => {
  installStorage(globalThis);
  if (typeof window !== 'undefined') {
    installStorage(window);
  }

  memoryStorage.clear();
  // Clearing storage mid-process is not something a real page can do to itself;
  // reset the cross-tab compare-and-swap token too so each test starts like a
  // freshly loaded page rather than one holding a stale ciphertext.
  resetVaultSyncState();
});

afterEach(() => {
  cleanup();
  memoryStorage.clear();
});
