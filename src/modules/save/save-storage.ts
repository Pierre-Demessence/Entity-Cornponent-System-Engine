export interface SaveEnvelope {
  checksum: string;
  header?: unknown;
  payload: string;
}

const TMP_SUFFIX = /_tmp$/;

export async function computeChecksum(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function createEnvelope(data: string, header?: unknown): Promise<SaveEnvelope> {
  const envelope: SaveEnvelope = { checksum: await computeChecksum(data), payload: data };
  if (header !== undefined)
    envelope.header = header;
  return envelope;
}

export async function verifyEnvelope(envelope: SaveEnvelope): Promise<boolean> {
  return (await computeChecksum(envelope.payload)) === envelope.checksum;
}

function parseEnvelope(raw: string): SaveEnvelope | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed
      && typeof parsed === 'object'
      && !Array.isArray(parsed)
      && typeof (parsed as SaveEnvelope).checksum === 'string'
      && typeof (parsed as SaveEnvelope).payload === 'string'
    ) {
      return parsed as SaveEnvelope;
    }
  }
  catch {
    // Corrupt or non-envelope data.
  }
  return null;
}

/**
 * Abstract save store with integrity checks, backup rotation, and orphan
 * recovery, backed by a key-value implementation.
 */
export abstract class SaveStorage {
  async delete(key: string): Promise<void> {
    await this.rawDelete(key);
    await this.rawDelete(`${key}_prev`);
    await this.rawDelete(`${key}_tmp`);
  }

  async listSaves(keyPattern: RegExp): Promise<Array<{ header: unknown; key: string }>> {
    const allKeys = await this.rawKeys();
    const saveKeys = allKeys.filter(k => keyPattern.test(k) && !k.endsWith('_prev') && !k.endsWith('_tmp'));
    const results: Array<{ header: unknown; key: string }> = [];

    for (const key of saveKeys) {
      const raw = await this.rawRead(key);
      if (!raw)
        continue;
      const envelope = parseEnvelope(raw);
      if (!envelope || !envelope.header)
        continue;
      if (await verifyEnvelope(envelope))
        results.push({ header: envelope.header, key });
    }

    return results;
  }

  async load(key: string): Promise<string | null> {
    const primary = await this.tryLoadVerified(key);
    if (primary !== null)
      return primary;

    const backup = await this.tryLoadVerified(`${key}_prev`);
    if (backup !== null) {
      console.warn(`[SaveStorage] Primary save "${key}" corrupt - loaded backup. Minor data loss possible.`);
      return backup;
    }

    return null;
  }

  protected abstract rawDelete(key: string): Promise<void>;

  protected abstract rawKeys(): Promise<string[]>;
  protected abstract rawRead(key: string): Promise<string | null>;
  protected abstract rawWrite(key: string, data: string): Promise<void>;

  async recoverOrphans(keyPattern: RegExp): Promise<void> {
    const allKeys = await this.rawKeys();
    const tmpKeys = allKeys.filter(k => k.endsWith('_tmp') && keyPattern.test(k));

    for (const tmpKey of tmpKeys) {
      const realKey = tmpKey.replace(TMP_SUFFIX, '');
      const tmpRaw = await this.rawRead(tmpKey);
      if (!tmpRaw) {
        await this.rawDelete(tmpKey);
        continue;
      }

      const envelope = parseEnvelope(tmpRaw);
      if (!envelope || !(await verifyEnvelope(envelope))) {
        console.warn(`[SaveStorage] Orphaned key "${tmpKey}" has invalid data - removing.`);
        await this.rawDelete(tmpKey);
        continue;
      }

      const realRaw = await this.rawRead(realKey);
      const realEnvelope = realRaw === null ? null : parseEnvelope(realRaw);
      const realValid = realEnvelope !== null && await verifyEnvelope(realEnvelope);

      if (!realValid) {
        console.warn(`[SaveStorage] Promoting orphaned key "${tmpKey}" -> "${realKey}".`);
        await this.rawWrite(realKey, tmpRaw);
      }

      await this.rawDelete(tmpKey);
    }
  }

  async save(key: string, data: string, header?: unknown): Promise<void> {
    const envelope = await createEnvelope(data, header);
    const serialized = JSON.stringify(envelope);

    const existing = await this.rawRead(key);
    if (existing !== null) {
      await this.rawWrite(`${key}_prev`, existing);
    }

    await this.rawWrite(key, serialized);
  }

  private async tryLoadVerified(key: string): Promise<string | null> {
    const raw = await this.rawRead(key);
    if (raw === null)
      return null;

    const envelope = parseEnvelope(raw);
    if (!envelope)
      return null;

    if (await verifyEnvelope(envelope)) {
      return envelope.payload;
    }

    return null;
  }
}
