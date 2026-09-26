# `@pierre/ecs/modules/audio`

Reusable audio primitives for ECS games: a provider interface,
validated audio source component, a queue for one-shots, and a
scheduler-ready system.

V1 is intentionally small:

- No clip loading pipeline in this module (use
  `@pierre/ecs/modules/asset-loader`).
- No engine-owned event contracts.

V2 adds a **spatial listener**: distance attenuation + stereo pan for
positioned sources, retuned every tick without restarting playback. Full 3D
HRTF panning and occlusion (muffling behind walls) are tracked separately and
are not part of this module yet.

## API

```ts
// @pierre/ecs/audio-provider

type AudioHandle = string;

interface AudioPlayOptions {
  channel?: string;
  delayMs?: number;
  loop?: boolean;
  volume?: number;
}

interface AudioProvider {
  play(clipId: string, options?: AudioPlayOptions): AudioHandle;
  setVolume(channel: string, value: number): void;
  setPlaybackVolume(handle: AudioHandle, value: number): void;
  setPlaybackPan(handle: AudioHandle, value: number): void;
  stop(handle: AudioHandle): void;
  dispose(): void;
}

// @pierre/ecs/modules/audio

interface AudioSpatial {
  x: number;
  y: number;
  refDistance?: number;
  maxDistance?: number;
  rolloff?: number;
}

interface AudioSource {
  channel?: string;
  clipId: string;
  loop?: boolean;
  spatial?: AudioSpatial;
  volume?: number;
}

const AudioSourceDef: ComponentDef<AudioSource>;

interface AudioListener { x: number; y: number }

class AudioQueue {
  play(clipId: string, options?: AudioPlayOptions): void;
  drain(): readonly AudioOneShot[];
  requeueFront(entries: readonly AudioOneShot[]): void;
}

interface AudioTickCtx { world: EcsWorld }

type AudioSystemErrorKind = 'one-shot-play' | 'source-play' | 'source-stop';

interface AudioSystemError {
  clipId?: string;
  entityId?: EntityId;
  error: unknown;
  kind: AudioSystemErrorKind;
}

function makeAudioSystem<TCtx extends AudioTickCtx>(options: {
  provider: AudioProvider;
  queue?: AudioQueue;
  sourceDef?: ComponentDef<AudioSource>;
  onError?: (error: AudioSystemError) => void;
  getListener?: (ctx: TCtx) => AudioListener | undefined;
  spatialDefaults?: { refDistance?: number; maxDistance?: number; rolloff?: number };
  name?: string;
  runAfter?: string[];
}): SchedulableSystem<TCtx>;

class WebAudioProvider implements AudioProvider {
  constructor(options?: {
    context?: AudioContext;
    clips?: ReadonlyMap<string, AudioBuffer> | Readonly<Record<string, AudioBuffer>>;
    resolveClip?: (clipId: string, context: AudioContext) => AudioBuffer | undefined;
    masterVolume?: number;
  });
}
```

## Usage

```ts
import { EcsWorld, Scheduler } from '@pierre/ecs';
import {
  AudioQueue,
  AudioSourceDef,
  makeAudioSystem,
  WebAudioProvider,
} from '@pierre/ecs/modules/audio';

const world = new EcsWorld();
world.registerComponent(AudioSourceDef);

const clips = new Map<string, AudioBuffer>();
const provider = new WebAudioProvider({ clips });
const queue = new AudioQueue();

const scheduler = new Scheduler<{ world: EcsWorld }>()
  .add(makeAudioSystem({ provider, queue }));

// One-shot sound (UI click, hit confirm, etc.)
queue.play('ui-click', { channel: 'ui', volume: 0.8 });

// Persistent looping source tied to an entity
const music = world.createEntity();
world.getStore(AudioSourceDef).set(music, {
  channel: 'music',
  clipId: 'bgm-town',
  loop: true,
  volume: 0.5,
});
```

## Spatial listener

Give a source a `spatial` position and pass a `getListener` accessor, and the
system attenuates volume by distance and pans it left/right — recomputed every
tick on the live playback, so a moving source never restarts.

```ts
const scheduler = new Scheduler<{ world: EcsWorld }>()
  .add(makeAudioSystem({
    provider,
    // The consumer supplies the listener from wherever it lives (player transform, camera, …).
    getListener: ctx => getPlayerPosition(ctx.world),
    spatialDefaults: { refDistance: 32, maxDistance: 640, rolloff: 1 },
  }));

const engine = world.createEntity();
world.getStore(AudioSourceDef).set(engine, {
  clipId: 'engine-hum',
  loop: true,
  volume: 1,
  spatial: { x: 240, y: 96 }, // per-source refDistance/maxDistance/rolloff optional
});
```

- **Attenuation** uses Web Audio's inverse-distance model: full volume within
  `refDistance`, falling off by `rolloff` out to `maxDistance` where it stops
  decreasing. Effective volume is `volume × attenuation`.
- **Pan** maps the horizontal offset from the listener into `[-1, 1]`,
  saturating at `maxDistance` (a source one `maxDistance` to the right is full
  right). This is the 2D stereo model; full 3D positional (HRTF) panning is a
  separate future entry.
- A source **without** `spatial`, or the system **without** a listener, plays
  non-spatially (base volume, centred) — the update is skipped entirely.
- Distance is Euclidean, so the same model extends to 3D once positions carry a
  third axis; only the pan is 2D-specific today.

## Validation Rules

`AudioSourceDef` rejects unsafe values early:

- `clipId` must be a non-empty string.
- `channel`, when provided, must be non-empty.
- `volume`, when provided, must be in `[0, 1]`.
- `spatial`, when provided, must have finite `x`/`y`; `refDistance` and
  `maxDistance` must be positive with `maxDistance >= refDistance`; `rolloff`
  must be `>= 0`.

`WebAudioProvider` enforces the same volume range for `play()` and
`setVolume()`. `delayMs` is clamped to a minimum of `0`. `setPlaybackVolume`
and `setPlaybackPan` clamp into `[0, 1]` and `[-1, 1]` respectively and ignore
unknown handles.
