const DISALLOWED_URL_SCHEME_RE = /^(?:javascript|file):/i;
const WINDOWS_ABSOLUTE_PATH_RE = /^[A-Z]:[\\/]/i;

/** The built-in asset kinds (`'image'`, `'json'`, `'audio-buffer'`, …), plus any custom string kind. */
export type AssetKind
  = | 'array-buffer'
    | 'audio-buffer'
    | 'font-face'
    | 'image'
    | 'json'
    | 'text'
    | (string & {});

/** Per-load options passed to a handle's `load`: an `AbortSignal` for cancellation. */
export interface AssetLoadOptions {
  signal?: AbortSignal;
}

/** {@link imageAsset} options: the `crossOrigin` attribute to set on the image. */
export interface ImageAssetOptions {
  crossOrigin?: string | null;
}

/** {@link fontFaceAsset} options: whether to `addToDocument` and the `FontFace` `descriptors`. */
export interface FontFaceAssetOptions {
  addToDocument?: boolean;
  descriptors?: FontFaceDescriptors;
}

/** Options for a custom {@link AssetLoaderOptions} `fontLoader` — the {@link FontFaceAssetOptions} fields. */
export interface FontLoaderOptions extends FontFaceAssetOptions {}

/** Options for a custom {@link AssetLoaderOptions} `imageLoader` — image and load options combined. */
export interface ImageLoaderOptions extends AssetLoadOptions, ImageAssetOptions {}

/** Progress for one asset in an `AssetLoader.loadMany` batch: `completed`/`total`, the `url`/`kind`, and whether it came `fromCache`. */
export interface AssetBatchProgress {
  completed: number;
  fromCache: boolean;
  kind: AssetKind;
  total: number;
  url: string;
}

/** Options for `AssetLoader.loadMany`: an `AbortSignal` plus an `onProgress` callback. */
export interface AssetBatchLoadOptions extends AssetLoadOptions {
  onProgress?: (progress: AssetBatchProgress) => void;
}

/** The fetch/decode helpers a handle's `load` receives from the loader, so a handle never touches `fetch` directly. */
export interface AssetLoadContext {
  fetchArrayBuffer: (url: string, options?: AssetLoadOptions) => Promise<ArrayBuffer>;
  fetchJson: <T = unknown>(url: string, options?: AssetLoadOptions) => Promise<T>;
  fetchText: (url: string, options?: AssetLoadOptions) => Promise<string>;
  loadFontFace: (url: string, family: string, options?: FontFaceAssetOptions & AssetLoadOptions) => Promise<FontFace>;
  loadImage: (url: string, options?: ImageLoaderOptions) => Promise<HTMLImageElement>;
}

/** A typed, cacheable reference to one asset: its `kind`, `url`, cache `identity`, and a `load` function. Build one with the `*Asset` helpers or {@link createAssetHandle}. */
export interface AssetHandle<TValue> {
  readonly identity: string;
  readonly kind: AssetKind;
  readonly url: string;
  readonly load: (context: AssetLoadContext, options: AssetLoadOptions) => Promise<TValue>;
}

/** Extracts the value a handle resolves to: `AssetValue<AssetHandle<T>>` is `T`. */
export type AssetValue<THandle extends AssetHandle<unknown>> = THandle extends AssetHandle<infer TValue>
  ? TValue
  : never;

/** {@link AssetLoader} construction options: override `fetch`, the URL allow-list, or the image/font loaders (e.g. for tests or a non-DOM host). */
export interface AssetLoaderOptions {
  fetch?: typeof fetch;
  isUrlAllowed?: (url: string) => boolean;
  fontLoader?: (
    family: string,
    source: ArrayBuffer,
    options?: FontLoaderOptions,
  ) => Promise<FontFace>;
  imageLoader?: (
    url: string,
    options?: ImageLoaderOptions,
  ) => Promise<HTMLImageElement>;
}

interface AssetCacheEntry {
  identity: string;
  kind: AssetKind;
  value: unknown;
}

interface AssetInFlightEntry {
  identity: string;
  kind: AssetKind;
  promise: Promise<unknown>;
  token: symbol;
}

function createAbortError(): Error {
  try {
    return new DOMException('The operation was aborted.', 'AbortError');
  }
  catch {
    const error = new Error('The operation was aborted.');
    error.name = 'AbortError';
    return error;
  }
}

function defaultIsUrlAllowed(url: string): boolean {
  return !DISALLOWED_URL_SCHEME_RE.test(url) && !WINDOWS_ABSOLUTE_PATH_RE.test(url);
}

async function defaultFontLoader(
  family: string,
  source: ArrayBuffer,
  options: FontLoaderOptions = {},
): Promise<FontFace> {
  if (typeof FontFace === 'undefined') {
    throw new TypeError('[asset-loader] FontFace API is not available in this environment.');
  }

  const font = new FontFace(family, source, options.descriptors);
  const loaded = await font.load();

  if (
    options.addToDocument !== false
    && typeof document !== 'undefined'
    && 'fonts' in document
    && document.fonts
  ) {
    document.fonts.add(loaded);
  }

  return loaded;
}

function defaultImageLoader(
  url: string,
  options: ImageLoaderOptions = {},
): Promise<HTMLImageElement> {
  if (typeof Image === 'undefined') {
    throw new TypeError('[asset-loader] Image API is not available in this environment.');
  }

  if (options.signal?.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    let onAbort: (() => void) | null = null;

    const cleanup = (): void => {
      image.onload = null;
      image.onerror = null;
      if (options.signal && onAbort) {
        options.signal.removeEventListener('abort', onAbort);
      }
    };

    onAbort = (): void => {
      cleanup();
      image.src = '';
      reject(createAbortError());
    };

    image.onload = () => {
      cleanup();
      resolve(image);
    };

    image.onerror = () => {
      cleanup();
      reject(new Error(`[asset-loader] Failed to load image: ${url}`));
    };

    image.crossOrigin = options.crossOrigin ?? 'anonymous';

    if (options.signal && onAbort) {
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

    image.src = url;
  });
}

function assertResponseOk(response: Response, url: string): Response {
  if (!response.ok) {
    throw new Error(`[asset-loader] Failed to fetch "${url}": HTTP ${response.status}`);
  }
  return response;
}

function normalizeIdentity(
  kind: AssetKind,
  identity: string | undefined,
): string {
  return identity && identity.length > 0 ? identity : String(kind);
}

function stringifyDescriptors(
  descriptors: FontFaceDescriptors | undefined,
): string {
  if (!descriptors) {
    return '';
  }

  const pairs = Object.entries(descriptors)
    .sort(([left], [right]) => left.localeCompare(right));

  return JSON.stringify(pairs);
}

function incompatibleHandleMessage(
  url: string,
  expected: { identity: string; kind: AssetKind },
  existing: { identity: string; kind: AssetKind },
): string {
  return `[asset-loader] URL "${url}" is already associated with kind "${existing.kind}" (identity "${existing.identity}") and cannot be reused for kind "${expected.kind}" (identity "${expected.identity}"). Asset cache is URL-keyed.`;
}

/**
 * The low-level `AssetHandle` factory: pairs a `kind` + `url` with a `load`
 * function and a normalized cache identity. The typed helpers below
 * (`imageAsset`, `jsonAsset`, …) wrap this for the common kinds; reach for it
 * directly only when writing a loader for a custom asset kind.
 */
export function createAssetHandle<TValue>(input: {
  kind: AssetKind;
  url: string;
  load: (context: AssetLoadContext, options: AssetLoadOptions) => Promise<TValue>;
  identity?: string;
}): AssetHandle<TValue> {
  return {
    identity: normalizeIdentity(input.kind, input.identity),
    kind: input.kind,
    load: input.load,
    url: input.url,
  };
}

/** An `AssetHandle` that fetches its URL as a raw `ArrayBuffer`. */
export function arrayBufferAsset(url: string): AssetHandle<ArrayBuffer> {
  return createAssetHandle({
    kind: 'array-buffer',
    url,
    load: (context, options) => context.fetchArrayBuffer(url, options),
  });
}

/** An `AssetHandle` that fetches its URL and parses the response as JSON. */
export function jsonAsset<TValue = unknown>(url: string): AssetHandle<TValue> {
  return createAssetHandle({
    kind: 'json',
    url,
    load: (context, options) => context.fetchJson<TValue>(url, options),
  });
}

/** An `AssetHandle` that fetches its URL as text. */
export function textAsset(url: string): AssetHandle<string> {
  return createAssetHandle({
    kind: 'text',
    url,
    load: (context, options) => context.fetchText(url, options),
  });
}

/**
 * An `AssetHandle` that decodes its URL into an `HTMLImageElement`.
 * `crossOrigin` defaults to `'anonymous'` so the image can be used as a
 * canvas/WebGL texture without tainting the surface.
 */
export function imageAsset(
  url: string,
  options: ImageAssetOptions = {},
): AssetHandle<HTMLImageElement> {
  const crossOrigin = options.crossOrigin ?? 'anonymous';
  return createAssetHandle({
    identity: `image:${String(crossOrigin)}`,
    kind: 'image',
    url,
    load: (context, loadOptions) => context.loadImage(url, {
      crossOrigin,
      signal: loadOptions.signal,
    }),
  });
}

/**
 * An `AssetHandle` that fetches its URL and decodes it into an `AudioBuffer`
 * with the supplied `BaseAudioContext` (Web Audio decoding is context-bound).
 */
export function audioBufferAsset(
  url: string,
  context: BaseAudioContext,
): AssetHandle<AudioBuffer> {
  return createAssetHandle({
    kind: 'audio-buffer',
    url,
    load: async (loaderContext, options) => {
      const audioData = await loaderContext.fetchArrayBuffer(url, options);
      return context.decodeAudioData(audioData);
    },
  });
}

/**
 * An `AssetHandle` that loads a web font into a `FontFace` for the given
 * `family`. Unless `addToDocument` is `false`, the loaded face is registered on
 * `document.fonts` so CSS can render with it immediately.
 */
export function fontFaceAsset(
  url: string,
  family: string,
  options: FontFaceAssetOptions = {},
): AssetHandle<FontFace> {
  const descriptorsToken = stringifyDescriptors(options.descriptors);
  const addToDocument = options.addToDocument !== false;

  return createAssetHandle({
    identity: `font-face:${family}:${String(addToDocument)}:${descriptorsToken}`,
    kind: 'font-face',
    url,
    load: (context, loadOptions) => context.loadFontFace(url, family, {
      addToDocument,
      descriptors: options.descriptors,
      signal: loadOptions.signal,
    }),
  });
}

/**
 * A URL-keyed asset cache with in-flight de-duplication: `load`ing the same
 * handle again returns the cached value or joins the pending request instead of
 * re-fetching. Supports batch loading, progress reporting, and `AbortSignal`
 * cancellation. Because the cache is keyed by URL, one URL may not be reused for
 * two different asset kinds.
 */
export class AssetLoader {
  private readonly cache = new Map<string, AssetCacheEntry>();
  private readonly context: AssetLoadContext;
  private readonly fetchImpl?: typeof fetch;
  private readonly fontLoader: (
    family: string,
    source: ArrayBuffer,
    options?: FontLoaderOptions,
  ) => Promise<FontFace>;

  private readonly imageLoader: (
    url: string,
    options?: ImageLoaderOptions,
  ) => Promise<HTMLImageElement>;

  private readonly inFlight = new Map<string, AssetInFlightEntry>();
  private readonly isUrlAllowed: (url: string) => boolean;

  constructor(options: AssetLoaderOptions = {}) {
    this.fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);
    this.fontLoader = options.fontLoader ?? defaultFontLoader;
    this.imageLoader = options.imageLoader ?? defaultImageLoader;
    this.isUrlAllowed = options.isUrlAllowed ?? defaultIsUrlAllowed;

    this.context = {
      fetchArrayBuffer: (url, loadOptions) => this.fetchArrayBuffer(url, loadOptions),
      fetchJson: (url, loadOptions) => this.fetchJson(url, loadOptions),
      fetchText: (url, loadOptions) => this.fetchText(url, loadOptions),
      loadFontFace: (url, family, loadOptions) => this.loadFontFace(url, family, loadOptions),
      loadImage: (url, loadOptions) => this.loadImage(url, loadOptions),
    };
  }

  private assertHandleCompatible(
    handle: AssetHandle<unknown>,
    existingKind: AssetKind,
    existingIdentity: string,
  ): void {
    if (handle.kind === existingKind && handle.identity === existingIdentity) {
      return;
    }

    throw new Error(incompatibleHandleMessage(
      handle.url,
      { identity: handle.identity, kind: handle.kind },
      { identity: existingIdentity, kind: existingKind },
    ));
  }

  private assertUrlAllowed(url: string): void {
    if (!this.isUrlAllowed(url)) {
      throw new Error(`[asset-loader] Disallowed asset URL: ${url}`);
    }
  }

  get cacheSize(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
    this.inFlight.clear();
  }

  evict(input: AssetHandle<unknown> | string): boolean {
    const url = typeof input === 'string' ? input : input.url;
    const deleted = this.cache.delete(url);
    this.inFlight.delete(url);
    return deleted;
  }

  async fetchArrayBuffer(
    url: string,
    options: AssetLoadOptions = {},
  ): Promise<ArrayBuffer> {
    const response = await this.fetchResponse(url, options);
    return response.arrayBuffer();
  }

  async fetchJson<TValue = unknown>(
    url: string,
    options: AssetLoadOptions = {},
  ): Promise<TValue> {
    const response = await this.fetchResponse(url, options);
    return (await response.json()) as TValue;
  }

  private async fetchResponse(
    url: string,
    options: AssetLoadOptions,
  ): Promise<Response> {
    this.assertUrlAllowed(url);

    if (!this.fetchImpl) {
      throw new Error('[asset-loader] Fetch API is not available in this environment.');
    }

    const response = await this.fetchImpl(url, { signal: options.signal });
    return assertResponseOk(response, url);
  }

  async fetchText(
    url: string,
    options: AssetLoadOptions = {},
  ): Promise<string> {
    const response = await this.fetchResponse(url, options);
    return response.text();
  }

  get<TValue>(handle: AssetHandle<TValue>): TValue | undefined {
    const entry = this.cache.get(handle.url);
    if (!entry) {
      return undefined;
    }
    this.assertHandleCompatible(handle, entry.kind, entry.identity);
    return entry.value as TValue;
  }

  has(input: AssetHandle<unknown> | string): boolean {
    if (typeof input === 'string') {
      return this.cache.has(input);
    }

    const entry = this.cache.get(input.url);
    if (!entry) {
      return false;
    }

    this.assertHandleCompatible(input, entry.kind, entry.identity);
    return true;
  }

  get inFlightSize(): number {
    return this.inFlight.size;
  }

  async load<TValue>(
    handle: AssetHandle<TValue>,
    options: AssetLoadOptions = {},
  ): Promise<TValue> {
    this.assertUrlAllowed(handle.url);

    const cached = this.cache.get(handle.url);
    if (cached) {
      this.assertHandleCompatible(handle, cached.kind, cached.identity);
      return cached.value as TValue;
    }

    const pending = this.inFlight.get(handle.url);
    if (pending) {
      this.assertHandleCompatible(handle, pending.kind, pending.identity);
      return pending.promise as Promise<TValue>;
    }

    const token = Symbol(handle.url);

    const promise = Promise.resolve()
      .then(() => handle.load(this.context, options))
      .then((value) => {
        const inFlight = this.inFlight.get(handle.url);
        if (inFlight?.token === token) {
          this.cache.set(handle.url, {
            identity: handle.identity,
            kind: handle.kind,
            value,
          });
        }
        return value;
      })
      .finally(() => {
        const inFlight = this.inFlight.get(handle.url);
        if (inFlight?.token === token) {
          this.inFlight.delete(handle.url);
        }
      });

    this.inFlight.set(handle.url, {
      identity: handle.identity,
      kind: handle.kind,
      promise,
      token,
    });

    return promise;
  }

  async loadFontFace(
    url: string,
    family: string,
    options: FontFaceAssetOptions & AssetLoadOptions = {},
  ): Promise<FontFace> {
    const source = await this.fetchArrayBuffer(url, { signal: options.signal });
    return this.fontLoader(family, source, {
      addToDocument: options.addToDocument,
      descriptors: options.descriptors,
    });
  }

  loadImage(
    url: string,
    options: ImageLoaderOptions = {},
  ): Promise<HTMLImageElement> {
    this.assertUrlAllowed(url);
    return this.imageLoader(url, options);
  }

  async loadMany<const THandles extends readonly AssetHandle<unknown>[]>(
    handles: THandles,
    options: AssetBatchLoadOptions = {},
  ): Promise<{ [Index in keyof THandles]: AssetValue<THandles[Index]> }> {
    let completed = 0;
    const total = handles.length;

    const tasks = handles.map(async (handle) => {
      let fromCache = false;
      try {
        fromCache = this.has(handle);
        return await this.load(handle, options);
      }
      finally {
        completed += 1;
        options.onProgress?.({
          completed,
          fromCache,
          kind: handle.kind,
          total,
          url: handle.url,
        });
      }
    });

    return Promise.all(tasks) as Promise<{ [Index in keyof THandles]: AssetValue<THandles[Index]> }>;
  }
}
