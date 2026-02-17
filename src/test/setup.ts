import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

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
});

afterEach(() => {
  cleanup();
  memoryStorage.clear();
});
