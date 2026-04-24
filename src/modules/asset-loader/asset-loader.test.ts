import { describe, expect, it, vi } from 'vitest';

import {
  AssetLoader,
  audioBufferAsset,
  fontFaceAsset,
  imageAsset,
  jsonAsset,
  textAsset,
} from './asset-loader';

function toArrayBuffer(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

function deferred<TValue>(): {
  promise: Promise<TValue>;
  reject: (reason?: unknown) => void;
  resolve: (value: TValue) => void;
} {
  let resolve!: (value: TValue) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<TValue>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

function toUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function okResponse(body: {
  arrayBuffer?: () => Promise<ArrayBuffer>;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}): Response {
  return {
    arrayBuffer: body.arrayBuffer ?? (async () => toArrayBuffer('')),
    json: body.json ?? (async () => null),
    ok: true,
    status: 200,
    text: body.text ?? (async () => ''),
  } as unknown as Response;
}

describe('assetLoader', () => {
  it('deduplicates in-flight requests and caches by URL', async () => {
    const fetchMock = vi.fn(async () => okResponse({
      json: async () => ({ ok: true }),
    }));

    const loader = new AssetLoader({
      fetch: fetchMock as unknown as typeof fetch,
    });

    const handle = jsonAsset<{ ok: boolean }>('/config.json');

    const [first, second] = await Promise.all([
      loader.load(handle),
      loader.load(handle),
    ]);

    const third = await loader.load(handle);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(loader.cacheSize).toBe(1);
  });

  it('tracks inFlightSize during pending requests and clear operations', async () => {
    const firstFetch = deferred<Response>();
    const fetchMock = vi.fn(async () => firstFetch.promise);

    const loader = new AssetLoader({
      fetch: fetchMock as unknown as typeof fetch,
    });

    const handle = textAsset('/pending.txt');
    const first = loader.load(handle);
    const second = loader.load(handle);

    expect(loader.inFlightSize).toBe(1);

    firstFetch.resolve(okResponse({
      text: async () => 'done',
    }));

    await expect(Promise.all([first, second])).resolves.toEqual(['done', 'done']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(loader.inFlightSize).toBe(0);
    expect(loader.cacheSize).toBe(1);

    expect(loader.evict(handle)).toBe(true);
    expect(loader.cacheSize).toBe(0);

    const secondFetch = deferred<Response>();
    fetchMock.mockImplementationOnce(async () => secondFetch.promise);

    const afterClear = loader.load(handle);
    expect(loader.inFlightSize).toBe(1);

    loader.clear();
    expect(loader.inFlightSize).toBe(0);

    secondFetch.resolve(okResponse({
      text: async () => 'stale-after-clear',
    }));

    await expect(afterClear).resolves.toBe('stale-after-clear');
    expect(loader.inFlightSize).toBe(0);
    expect(loader.has(handle)).toBe(false);
  });

  it('reports batch progress with cache awareness', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = toUrl(input);
      return okResponse({
        text: async () => `payload:${url}`,
      });
    });

    const loader = new AssetLoader({
      fetch: fetchMock as unknown as typeof fetch,
    });

    const firstBatchProgress: Array<{ completed: number; fromCache: boolean }> = [];
    await loader.loadMany([
      textAsset('/a.txt'),
      textAsset('/b.txt'),
    ], {
      onProgress: (progress) => {
        firstBatchProgress.push({
          completed: progress.completed,
          fromCache: progress.fromCache,
        });
      },
    });

    expect(firstBatchProgress).toEqual([
      { completed: 1, fromCache: false },
      { completed: 2, fromCache: false },
    ]);

    const secondBatchProgress: Array<{ completed: number; fromCache: boolean }> = [];
    await loader.loadMany([
      textAsset('/a.txt'),
      textAsset('/b.txt'),
    ], {
      onProgress: (progress) => {
        secondBatchProgress.push({
          completed: progress.completed,
          fromCache: progress.fromCache,
        });
      },
    });

    expect(secondBatchProgress).toEqual([
      { completed: 1, fromCache: true },
      { completed: 2, fromCache: true },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('still reports progress when compatibility checks fail', async () => {
    const fetchMock = vi.fn(async () => okResponse({
      json: async () => ({ ok: true }),
    }));

    const loader = new AssetLoader({
      fetch: fetchMock as unknown as typeof fetch,
    });

    await loader.load(jsonAsset('/shared.asset'));

    const progress: number[] = [];
    await expect(loader.loadMany([
      imageAsset('/shared.asset'),
    ], {
      onProgress: ({ completed }) => {
        progress.push(completed);
      },
    })).rejects.toThrow(/already associated/);

    expect(progress).toEqual([1]);
  });

  it('throws when reusing a URL with an incompatible handle identity', async () => {
    const fetchMock = vi.fn(async () => okResponse({
      json: async () => ({ ok: true }),
    }));

    const loader = new AssetLoader({
      fetch: fetchMock as unknown as typeof fetch,
    });

    await loader.load(jsonAsset('/shared.asset'));

    await expect(loader.load(imageAsset('/shared.asset')))
      .rejects
      .toThrow(/already associated/);
  });

  it('does not repopulate cache after clear when an in-flight load resolves', async () => {
    const firstFetch = deferred<Response>();
    let firstCall = true;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (toUrl(input) === '/race.txt' && firstCall) {
        firstCall = false;
        return firstFetch.promise;
      }
      return Promise.resolve(okResponse({
        text: async () => 'fresh',
      }));
    });

    const loader = new AssetLoader({
      fetch: fetchMock as unknown as typeof fetch,
    });

    const handle = textAsset('/race.txt');
    const pending = loader.load(handle);
    loader.clear();

    firstFetch.resolve(okResponse({
      text: async () => 'stale',
    }));

    await expect(pending).resolves.toBe('stale');
    expect(loader.has('/race.txt')).toBe(false);

    const fresh = await loader.load(handle);
    expect(fresh).toBe('fresh');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache failed fetches and allows retry', async () => {
    const fetchMock = vi.fn(async () => {
      return {
        ok: false,
        status: 404,
      } as unknown as Response;
    });

    const loader = new AssetLoader({
      fetch: fetchMock as unknown as typeof fetch,
    });

    const handle = textAsset('/missing.txt');

    await expect(loader.load(handle)).rejects.toThrow(/HTTP 404/);
    await expect(loader.load(handle)).rejects.toThrow(/HTTP 404/);

    expect(loader.has(handle)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects disallowed URL schemes', async () => {
    const loader = new AssetLoader();

    await expect(loader.load(textAsset('javascript:alert(1)')))
      .rejects
      .toThrow(/Disallowed asset URL/);
  });

  it('does not cache aborted fetch requests', async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        if (!signal) {
          reject(new Error('missing signal'));
          return;
        }
        if (signal.aborted) {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
          return;
        }
        signal.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        }, { once: true });
      });
    });

    const loader = new AssetLoader({
      fetch: fetchMock as unknown as typeof fetch,
    });
    const controller = new AbortController();

    const pending = loader.load(textAsset('/abort.txt'), {
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(loader.has('/abort.txt')).toBe(false);
  });

  it('does not retain state when load is called with a pre-aborted signal', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }

      return okResponse({
        text: async () => 'retried',
      });
    });

    const loader = new AssetLoader({
      fetch: fetchMock as unknown as typeof fetch,
    });

    const handle = textAsset('/pre-abort.txt');
    const controller = new AbortController();
    controller.abort();

    await expect(loader.load(handle, {
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });

    expect(loader.inFlightSize).toBe(0);
    expect(loader.has(handle)).toBe(false);

    await expect(loader.load(handle)).resolves.toBe('retried');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(loader.has(handle)).toBe(true);
  });

  it('loads and caches decoded audio buffers', async () => {
    const fetchMock = vi.fn(async () => okResponse({
      arrayBuffer: async () => toArrayBuffer('wave-data'),
    }));

    const fakeAudioBuffer = { id: 'buffer' } as unknown as AudioBuffer;
    const audioContext = {
      decodeAudioData: vi.fn(async () => fakeAudioBuffer),
    } as unknown as BaseAudioContext;

    const loader = new AssetLoader({
      fetch: fetchMock as unknown as typeof fetch,
    });

    const handle = audioBufferAsset('/laser.wav', audioContext);

    const first = await loader.load(handle);
    const second = await loader.load(handle);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(audioContext.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('forwards image options to the configured image loader', async () => {
    const image = { width: 16 } as unknown as HTMLImageElement;
    const imageLoader = vi.fn(async () => image);

    const loader = new AssetLoader({ imageLoader });
    const controller = new AbortController();

    const handle = imageAsset('/sprite.png', { crossOrigin: 'use-credentials' });
    const loaded = await loader.load(handle, { signal: controller.signal });

    expect(loaded).toBe(image);
    expect(imageLoader).toHaveBeenCalledTimes(1);
    expect(imageLoader).toHaveBeenCalledWith('/sprite.png', {
      crossOrigin: 'use-credentials',
      signal: controller.signal,
    });
  });

  it('supports font handles and blocks incompatible font identity reuse', async () => {
    const fetchMock = vi.fn(async () => okResponse({
      arrayBuffer: async () => toArrayBuffer('font-data'),
    }));
    const fontLoader = vi.fn(async (family: string) => {
      return { family } as unknown as FontFace;
    });

    const loader = new AssetLoader({
      fetch: fetchMock as unknown as typeof fetch,
      fontLoader,
    });

    const arcade = fontFaceAsset('/font.woff2', 'Arcade', {
      addToDocument: false,
      descriptors: { weight: '700' },
    });

    const font = await loader.load(arcade);

    expect(fontLoader).toHaveBeenCalledTimes(1);
    expect((font as unknown as { family: string }).family).toBe('Arcade');

    const otherFamily = fontFaceAsset('/font.woff2', 'Serif', {
      addToDocument: false,
    });

    await expect(loader.load(otherFamily)).rejects.toThrow(/already associated/);
  });
});
