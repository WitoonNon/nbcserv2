'use client';

import type { OutboxItem, OutboxStore } from './outbox';

/**
 * IndexedDB behind the outbox.
 *
 * IndexedDB rather than localStorage because the queue holds photographs:
 * localStorage is strings only and capped at a few megabytes, so one photo
 * would fill it. IndexedDB stores Blobs directly and survives the browser
 * being closed, which is the case that matters — a technician finishing a job
 * in a car park and putting the phone away.
 *
 * Raw API rather than a wrapper library: one store, four operations.
 */

const DB_NAME = 'nbc-offline';
const DB_VERSION = 1;
const STORE = 'outbox';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        // Flushing walks this index, so the order things happened in is the
        // order they are sent.
        store.createIndex('createdAt', 'createdAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = work(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

export const indexedDbStore: OutboxStore = {
  async add(item) {
    await run('readwrite', (store) => store.add(item));
  },

  async all() {
    const items = await run<OutboxItem[]>('readonly', (store) =>
      store.index('createdAt').getAll(),
    );
    return items;
  },

  async put(item) {
    await run('readwrite', (store) => store.put(item));
  },

  async remove(id) {
    await run('readwrite', (store) => store.delete(id));
  },
};

/** False in a browser too old or a context where storage is blocked. */
export function indexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}
