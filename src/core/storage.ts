/**
 * Storage durability.
 *
 * The realistic threat to a local-first vault is not an attacker — it is the
 * browser quietly evicting it. By default both localStorage and IndexedDB are
 * "best-effort" storage that a browser may clear under disk pressure, and this
 * app has no recovery path. Asking for persistent storage, and telling the user
 * when it was not granted, is the difference between "your data is safe here"
 * and "your data is here until it isn't".
 */

export interface StorageHealth {
  /** True when the browser promised not to evict our data without permission. */
  persisted: boolean;
  /** Whether the browser exposes the Storage API at all. */
  supported: boolean;
  /** Bytes currently used, when the browser reports it. */
  usageBytes: number | null;
  /** Bytes available to this origin, when the browser reports it. */
  quotaBytes: number | null;
}

function storageManager(): StorageManager | null {
  if (typeof navigator === 'undefined' || !navigator.storage) {
    return null;
  }
  return navigator.storage;
}

/**
 * Ask the browser to make this origin's storage persistent. Safe to call
 * repeatedly: if permission was already granted it resolves true without
 * prompting. Returns false where unsupported or denied.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  const manager = storageManager();
  if (!manager?.persist || !manager.persisted) {
    return false;
  }

  try {
    if (await manager.persisted()) {
      return true;
    }
    return await manager.persist();
  } catch {
    return false;
  }
}

/** Read current persistence + quota state for display. */
export async function readStorageHealth(): Promise<StorageHealth> {
  const manager = storageManager();
  if (!manager?.persisted) {
    return { persisted: false, supported: false, usageBytes: null, quotaBytes: null };
  }

  let persisted = false;
  try {
    persisted = await manager.persisted();
  } catch {
    persisted = false;
  }

  let usageBytes: number | null = null;
  let quotaBytes: number | null = null;
  if (manager.estimate) {
    try {
      const estimate = await manager.estimate();
      usageBytes = typeof estimate.usage === 'number' ? estimate.usage : null;
      quotaBytes = typeof estimate.quota === 'number' ? estimate.quota : null;
    } catch {
      // Estimates are advisory; absence is not an error.
    }
  }

  return { persisted, supported: true, usageBytes, quotaBytes };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${String(bytes)} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]!}`;
}

/** Backups older than this are considered overdue and are surfaced to the user. */
export const BACKUP_STALE_DAYS = 14;

export interface BackupFreshness {
  /** True when there is no export on record at all. */
  never: boolean;
  /** Whole days since the last export, or null if never exported. */
  ageDays: number | null;
  /** True when the user should be prompted to export again. */
  overdue: boolean;
}

export function backupFreshness(lastExportIso: string | undefined, now = Date.now()): BackupFreshness {
  if (!lastExportIso) {
    return { never: true, ageDays: null, overdue: true };
  }

  const then = new Date(lastExportIso).getTime();
  if (!Number.isFinite(then)) {
    return { never: true, ageDays: null, overdue: true };
  }

  const ageDays = Math.max(0, Math.floor((now - then) / (24 * 60 * 60 * 1000)));
  return { never: false, ageDays, overdue: ageDays >= BACKUP_STALE_DAYS };
}
