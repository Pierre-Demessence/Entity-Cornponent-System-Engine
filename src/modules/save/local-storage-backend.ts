import { SaveStorage } from './save-storage';

/**
 * localStorage-backed SaveStorage implementation using tmp-write verification
 * to reduce corruption risk.
 */
export class LocalStorageBackend extends SaveStorage {
  protected async rawDelete(key: string): Promise<void> {
    localStorage.removeItem(key);
  }

  protected async rawKeys(): Promise<string[]> {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== null)
        keys.push(key);
    }
    return keys;
  }

  protected async rawRead(key: string): Promise<string | null> {
    return localStorage.getItem(key);
  }

  protected async rawWrite(key: string, data: string): Promise<void> {
    const tmpKey = `${key}_tmp`;

    localStorage.setItem(tmpKey, data);
    const readBack = localStorage.getItem(tmpKey);
    if (readBack !== data) {
      localStorage.removeItem(tmpKey);
      throw new Error(`Write verification failed for key "${key}".`);
    }

    localStorage.setItem(key, data);
    localStorage.removeItem(tmpKey);
  }
}
