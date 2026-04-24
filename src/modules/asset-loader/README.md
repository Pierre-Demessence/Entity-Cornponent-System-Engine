# `@pierre/ecs/modules/asset-loader`

Shared async asset loading primitives for ECS games.

V1 goals:

- typed handles (`AssetHandle<T>`)
- URL-keyed cache
- in-flight request deduplication
- batch progress callbacks

V1 intentionally does not include dev hot-reload tooling or live asset
watchers.

## API

```ts
type AssetKind
  = 'array-buffer'
    | 'audio-buffer'
    | 'font-face'
    | 'image'
    | 'json'
    | 'text'
    | (string & {});

interface AssetHandle<T> {
  readonly kind: AssetKind;
  readonly url: string;
  readonly identity: string;
}

interface AssetLoadOptions {
  signal?: AbortSignal;
}

interface AssetBatchProgress {
  completed: number;
  total: number;
  kind: AssetKind;
  url: string;
  fromCache: boolean;
}

class AssetLoader {
  constructor(options?: AssetLoaderOptions);

  get cacheSize(): number;
  get inFlightSize(): number;

  has(input: AssetHandle<unknown> | string): boolean;
  get<T>(handle: AssetHandle<T>): T | undefined;
  evict(input: AssetHandle<unknown> | string): boolean;
  clear(): void;

  load<T>(handle: AssetHandle<T>, options?: AssetLoadOptions): Promise<T>;
  loadMany<const THandles extends readonly AssetHandle<unknown>[]>(
    handles: THandles,
    options?: {
      signal?: AbortSignal;
      onProgress?: (progress: AssetBatchProgress) => void;
    },
  ): Promise<{ [Index in keyof THandles]: AssetValue<THandles[Index]> }>;
}

function arrayBufferAsset(url: string): AssetHandle<ArrayBuffer>;
function jsonAsset<T = unknown>(url: string): AssetHandle<T>;
function textAsset(url: string): AssetHandle<string>;
function imageAsset(
  url: string,
  options?: { crossOrigin?: string | null },
): AssetHandle<HTMLImageElement>;
function audioBufferAsset(
  url: string,
  context: BaseAudioContext,
): AssetHandle<AudioBuffer>;
function fontFaceAsset(
  url: string,
  family: string,
  options?: {
    descriptors?: FontFaceDescriptors;
    addToDocument?: boolean;
  },
): AssetHandle<FontFace>;

function createAssetHandle<T>(input: {
  kind: AssetKind;
  url: string;
  identity?: string;
  load: (context: AssetLoadContext, options: AssetLoadOptions) => Promise<T>;
}): AssetHandle<T>;
```

## Usage

```ts
import {
  AssetLoader,
  audioBufferAsset,
  imageAsset,
  jsonAsset,
} from '@pierre/ecs/modules/asset-loader';

const loader = new AssetLoader();

const sprite = imageAsset(new URL('./sprite.png', import.meta.url).toString());
const config = jsonAsset<{ spawnRate: number }>(
  new URL('./config.json', import.meta.url).toString(),
);

const [spriteImage, gameConfig] = await loader.loadMany([sprite, config], {
  onProgress: ({ completed, total }) => {
    console.log(`loaded ${completed}/${total}`);
  },
});

const context = new AudioContext();
const laser = audioBufferAsset(
  new URL('./audio/laser.wav', import.meta.url).toString(),
  context,
);
await loader.load(laser);
```

## Notes

- Cache is keyed by URL. Loading the same URL with incompatible handle
  identity (for example `json` then `image`) throws.
- Failed loads are not cached; retry by calling `load()` again.
- Disallowed URL schemes are rejected (`javascript:` and `file:`).
