import { SaveStorage } from './save-storage';

export interface IndexedDbSaveOptions {
  dbName?: string;
  dbVersion?: number;
  storeName?: string;
}

const DEFAULT_DB_NAME = 'pierre-ecs-save';
const DEFAULT_DB_VERSION = 1;
const DEFAULT_STORE_NAME = 'saves';

/**
 * IndexedDB-backed SaveStorage implementation.
 */
export class IndexedDBBackend extends SaveStorage {
  private db: IDBDatabase | null = null;

  private readonly dbName: string;
  private readonly dbVersion: number;
  private readonly storeName: string;

  constructor(options: IndexedDbSaveOptions = {}) {
    super();
    this.dbName = options.dbName ?? DEFAULT_DB_NAME;
    this.dbVersion = options.dbVersion ?? DEFAULT_DB_VERSION;
    this.storeName = options.storeName ?? DEFAULT_STORE_NAME;
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  async open(): Promise<void> {
    if (this.db)
      return;

    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(this.storeName);
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          this.db = null;
        };
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  protected async rawDelete(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.requireDb().transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  protected async rawKeys(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const tx = this.requireDb().transaction(this.storeName, 'readonly');
      const request = tx.objectStore(this.storeName).getAllKeys();
      request.onsuccess = () => resolve(request.result.filter((k): k is string => typeof k === 'string'));
      request.onerror = () => reject(request.error);
    });
  }

  protected async rawRead(key: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const tx = this.requireDb().transaction(this.storeName, 'readonly');
      const request = tx.objectStore(this.storeName).get(key);
      request.onsuccess = () => resolve((request.result as string) ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  protected async rawWrite(key: string, data: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.requireDb().transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).put(data, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private requireDb(): IDBDatabase {
    if (!this.db)
      throw new Error('IndexedDB not opened. Call open() first.');
    return this.db;
  }
}
