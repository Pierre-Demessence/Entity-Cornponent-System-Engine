import type { AudioHandle, AudioPlayOptions, AudioProvider } from '#audio-provider';
import type { ComponentDef } from '#component-store';
import type { EntityId } from '#entity-id';
import type { SchedulableSystem } from '#scheduler';
import type { EcsWorld } from '#world';
import type { AudioSource } from './audio-source';

import { AudioSourceDef } from './audio-source';

/** The tick-context {@link makeAudioSystem} reads: `world`. */
export interface AudioTickCtx { world: EcsWorld }

/** A queued one-shot sound: a `clipId` and optional {@link AudioPlayOptions}. */
export interface AudioOneShot {
  clipId: string;
  options?: AudioPlayOptions;
}

/** Which audio operation failed: a one-shot play, or a source's play or stop. */
export type AudioSystemErrorKind = 'one-shot-play' | 'source-play' | 'source-stop';

/** A provider failure surfaced to `onError`: the `kind`, the underlying `error`, and the `clipId`/`entityId` involved. */
export interface AudioSystemError {
  clipId?: string;
  entityId?: EntityId;
  error: unknown;
  kind: AudioSystemErrorKind;
}

/**
 * A FIFO of one-shot sound requests the audio system drains each tick. `play`
 * enqueues a clip; the system `drain`s the queue and, when a clip fails to
 * start, `requeueFront`s it to retry next tick. Decoupling the queue from the
 * system lets game code fire sounds without holding a provider reference.
 */
export class AudioQueue {
  private readonly pending: AudioOneShot[] = [];

  drain(): readonly AudioOneShot[] {
    const drained = this.pending.slice();
    this.pending.length = 0;
    return drained;
  }

  play(clipId: string, options?: AudioPlayOptions): void {
    this.pending.push({ clipId, options });
  }

  requeueFront(entries: readonly AudioOneShot[]): void {
    if (entries.length === 0)
      return;
    this.pending.unshift(...entries);
  }
}

/** Options for {@link makeAudioSystem}: the `provider`, an optional one-shot `queue` and `sourceDef`, spatial `getListener`/`spatialDefaults`, plus `name`/`runAfter`/`onError`. */
export interface AudioSystemOptions<TCtx extends AudioTickCtx = AudioTickCtx> {
  name?: string;
  provider: AudioProvider;
  queue?: AudioQueue;
  runAfter?: string[];
  sourceDef?: ComponentDef<AudioSource>;
  /** Falloff defaults for spatial sources that omit their own. Web Audio defaults: `refDistance 1`, `maxDistance 10000`, `rolloff 1`. */
  spatialDefaults?: SpatialDefaults;
  /** Listener position for spatial sources; sources with a `spatial` field are attenuated/panned relative to it. Return `undefined` to leave spatial sources at base volume. */
  getListener?: (ctx: TCtx) => AudioListener | undefined;
  onError?: (error: AudioSystemError) => void;
}

/** Listener position spatial sources are attenuated and panned against. */
export interface AudioListener {
  x: number;
  y: number;
}

/** Inverse-distance falloff tuning applied when a spatial source omits its own. */
export interface SpatialDefaults {
  maxDistance?: number;
  refDistance?: number;
  rolloff?: number;
}

interface ResolvedFalloff {
  maxDistance: number;
  refDistance: number;
  rolloff: number;
}

interface ActivePlayback {
  handle: AudioHandle;
  signature: string;
}

function sourceSignature(source: AudioSource): string {
  return `${source.clipId}\n${source.channel ?? ''}\n${String(source.loop ?? false)}\n${String(source.volume ?? '')}`;
}

function sourceToPlayOptions(source: AudioSource): AudioPlayOptions {
  return {
    channel: source.channel,
    loop: source.loop,
    volume: source.volume,
  };
}

/** Inverse-distance attenuation × base volume, clamped to `[0, 1]`; Web Audio's `PannerNode` inverse model. */
function spatialVolume(source: AudioSource, listener: AudioListener, falloff: ResolvedFalloff): number {
  const spatial = source.spatial;
  if (spatial === undefined)
    return source.volume ?? 1;
  const dist = Math.hypot(spatial.x - listener.x, spatial.y - listener.y);
  const ref = spatial.refDistance ?? falloff.refDistance;
  const max = spatial.maxDistance ?? falloff.maxDistance;
  const rolloff = spatial.rolloff ?? falloff.rolloff;
  const clamped = dist < ref ? ref : dist > max ? max : dist;
  const atten = ref / (ref + rolloff * (clamped - ref));
  const volume = (source.volume ?? 1) * atten;
  if (!Number.isFinite(volume))
    return 0;
  return volume < 0 ? 0 : volume > 1 ? 1 : volume;
}

/** Horizontal offset from the listener mapped into `[-1, 1]`, saturating at `maxDistance`. */
function spatialPan(source: AudioSource, listener: AudioListener, falloff: ResolvedFalloff): number {
  const spatial = source.spatial;
  if (spatial === undefined)
    return 0;
  const max = spatial.maxDistance ?? falloff.maxDistance;
  const pan = (spatial.x - listener.x) / max;
  return pan < -1 ? -1 : pan > 1 ? 1 : pan;
}

/** Resolve and validate the system-wide falloff defaults, filling the Web Audio defaults where omitted. */
function resolveFalloff(defaults: SpatialDefaults | undefined): ResolvedFalloff {
  const refDistance = defaults?.refDistance ?? 1;
  const maxDistance = defaults?.maxDistance ?? 10000;
  const rolloff = defaults?.rolloff ?? 1;
  if (!Number.isFinite(refDistance) || refDistance <= 0)
    throw new Error('makeAudioSystem: spatialDefaults.refDistance must be positive.');
  if (!Number.isFinite(maxDistance) || maxDistance <= 0)
    throw new Error('makeAudioSystem: spatialDefaults.maxDistance must be positive.');
  if (maxDistance < refDistance)
    throw new Error('makeAudioSystem: spatialDefaults.maxDistance must be greater than or equal to refDistance.');
  if (!Number.isFinite(rolloff) || rolloff < 0)
    throw new Error('makeAudioSystem: spatialDefaults.rolloff must be greater than or equal to 0.');
  return { maxDistance, refDistance, rolloff };
}

/**
 * A `SchedulableSystem` that drives an `AudioProvider` from the world's
 * `AudioSource` components plus a one-shot `AudioQueue`: it starts playback for
 * a new source, restarts one whose parameters changed (a signature miss), and
 * stops playback for a source that disappeared. Provider failures are reported
 * to `onError` rather than thrown, so a bad clip cannot halt the tick.
 */
export function makeAudioSystem<TCtx extends AudioTickCtx>(
  options: AudioSystemOptions<TCtx>,
): SchedulableSystem<TCtx> {
  const {
    name = 'audio',
    getListener,
    onError,
    provider,
    queue = new AudioQueue(),
    runAfter,
    sourceDef = AudioSourceDef,
    spatialDefaults,
  } = options;

  const falloff = resolveFalloff(spatialDefaults);

  const active = new Map<EntityId, ActivePlayback>();
  const pendingStops = new Set<AudioHandle>();

  return {
    name,
    runAfter,
    run(ctx) {
      for (const handle of Array.from(pendingStops)) {
        try {
          provider.stop(handle);
          pendingStops.delete(handle);
        }
        catch (error) {
          onError?.({ error, kind: 'source-stop' });
        }
      }

      const failedOneShots: AudioOneShot[] = [];
      for (const oneShot of queue.drain()) {
        try {
          provider.play(oneShot.clipId, oneShot.options);
        }
        catch (error) {
          failedOneShots.push(oneShot);
          onError?.({ clipId: oneShot.clipId, error, kind: 'one-shot-play' });
        }
      }
      queue.requeueFront(failedOneShots);

      const store = ctx.world.getStore(sourceDef);
      const seen = new Set<EntityId>();
      const listener = getListener?.(ctx);

      for (const [id, source] of store.entries()) {
        seen.add(id);

        const signature = sourceSignature(source);
        const current = active.get(id);
        let handle = current?.handle;

        if (current?.signature !== signature) {
          let nextHandle: AudioHandle;
          try {
            nextHandle = provider.play(source.clipId, sourceToPlayOptions(source));
          }
          catch (error) {
            onError?.({
              clipId: source.clipId,
              entityId: id,
              error,
              kind: 'source-play',
            });
            continue;
          }

          active.set(id, { handle: nextHandle, signature });
          handle = nextHandle;

          if (current) {
            try {
              provider.stop(current.handle);
            }
            catch (error) {
              pendingStops.add(current.handle);
              onError?.({
                clipId: source.clipId,
                entityId: id,
                error,
                kind: 'source-stop',
              });
            }
          }
        }

        if (handle !== undefined && source.spatial !== undefined && listener !== undefined) {
          provider.setPlaybackVolume(handle, spatialVolume(source, listener, falloff));
          provider.setPlaybackPan(handle, spatialPan(source, listener, falloff));
        }
      }

      for (const [id, playback] of Array.from(active.entries())) {
        if (seen.has(id))
          continue;

        try {
          provider.stop(playback.handle);
          active.delete(id);
        }
        catch (error) {
          pendingStops.add(playback.handle);
          onError?.({ entityId: id, error, kind: 'source-stop' });
          active.delete(id);
        }
      }
    },
  };
}
