import type { EncryptedPayload } from './crypto';

const DB_NAME = 'unlinkd';
const DB_VERSION = 1;
const STORE_EVIDENCE = 'evidence';

interface EvidenceRow {
  id: string;
  payload: EncryptedPayload;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_EVIDENCE)) {
        db.createObjectStore(STORE_EVIDENCE, { keyPath: 'id' });
      }
    };

    request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB.'));
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_EVIDENCE, mode);
    const store = tx.objectStore(STORE_EVIDENCE);
    const request = fn(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));

    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      reject(tx.error ?? new Error('IndexedDB transaction failed.'));
      db.close();
    };
  });
}

export async function putEvidencePayload(id: string, payload: EncryptedPayload): Promise<void> {
  await withStore('readwrite', (store) => store.put({ id, payload } satisfies EvidenceRow));
}

export async function getEvidencePayload(id: string): Promise<EncryptedPayload | null> {
  const row = await withStore<EvidenceRow | undefined>('readonly', (store) => store.get(id));
  return row?.payload ?? null;
}

export async function deleteEvidencePayload(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id));
}

export async function listEvidencePayloads(): Promise<Array<{ id: string; payload: EncryptedPayload }>> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_EVIDENCE, 'readonly');
    const store = tx.objectStore(STORE_EVIDENCE);
    const request = store.getAll() as IDBRequest<EvidenceRow[]>;

    request.onsuccess = () => {
      resolve((request.result ?? []).map((row) => ({ id: row.id, payload: row.payload })));
    };

    request.onerror = () => reject(request.error ?? new Error('Unable to list evidence.'));

    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      reject(tx.error ?? new Error('IndexedDB transaction failed.'));
      db.close();
    };
  });
}

export async function clearEvidenceStore(): Promise<void> {
  await withStore('readwrite', (store) => store.clear());
}

