# `@pierre/ecs/modules/audio`

Reusable audio primitives for ECS games: a provider interface,
validated audio source component, a queue for one-shots, and a
scheduler-ready system.

V1 is intentionally small:

- No clip loading pipeline in this module (use
  `@pierre/ecs/modules/asset-loader`).
- No spatial listener model yet.
- No engine-owned event contracts.

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
  stop(handle: AudioHandle): void;
  dispose(): void;
}

// @pierre/ecs/modules/audio

interface AudioSource {
  channel?: string;
  clipId: string;
  loop?: boolean;
  volume?: number;
}

const AudioSourceDef: ComponentDef<AudioSource>;

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

## Validation Rules

`AudioSourceDef` rejects unsafe values early:

- `clipId` must be a non-empty string.
- `channel`, when provided, must be non-empty.
- `volume`, when provided, must be in `[0, 1]`.

`WebAudioProvider` enforces the same volume range for `play()` and
`setVolume()`. `delayMs` is clamped to a minimum of `0`.
