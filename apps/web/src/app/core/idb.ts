/**
 * One object store, key/value, promise-shaped. Everything the inspector app
 * keeps offline — drafts, the outbox, the cached queue, photo Blobs — is a
 * value under a prefixed key, so a key/value store is the whole requirement.
 * Dexie would be ~25KB to do exactly this.
 */
const DB_NAME = 'aman';
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = fn(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const idb = {
  get: <T>(key: string) => run<T | undefined>('readonly', (s) => s.get(key) as IDBRequest<T | undefined>),
  set: <T>(key: string, value: T) => run('readwrite', (s) => s.put(value, key)),
  del: (key: string) => run('readwrite', (s) => s.delete(key)),
  keys: () => run<IDBValidKey[]>('readonly', (s) => s.getAllKeys()),

  async prefixed<T>(prefix: string): Promise<{ key: string; value: T }[]> {
    const keys = (await idb.keys()).map(String).filter((k) => k.startsWith(prefix));
    const values = await Promise.all(keys.map((k) => idb.get<T>(k)));
    return keys
      .map((key, i) => ({ key, value: values[i] as T }))
      .filter((entry) => entry.value !== undefined);
  },
};
