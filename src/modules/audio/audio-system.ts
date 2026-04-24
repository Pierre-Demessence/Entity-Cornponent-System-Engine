import type { AudioHandle, AudioPlayOptions, AudioProvider } from '#audio-provider';
import type { ComponentDef } from '#component-store';
import type { EntityId } from '#entity-id';
import type { SchedulableSystem } from '#scheduler';
import type { EcsWorld } from '#world';

import type { AudioSource } from './audio-source';

import { AudioSourceDef } from './audio-source';

export interface AudioTickCtx { world: EcsWorld }

export interface AudioOneShot {
  clipId: string;
  options?: AudioPlayOptions;
}

export type AudioSystemErrorKind = 'one-shot-play' | 'source-play' | 'source-stop';

export interface AudioSystemError {
  clipId?: string;
  entityId?: EntityId;
  error: unknown;
  kind: AudioSystemErrorKind;
}

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

export interface AudioSystemOptions {
  name?: string;
  provider: AudioProvider;
  queue?: AudioQueue;
  runAfter?: string[];
  sourceDef?: ComponentDef<AudioSource>;
  onError?: (error: AudioSystemError) => void;
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

export function makeAudioSystem<TCtx extends AudioTickCtx>(
  options: AudioSystemOptions,
): SchedulableSystem<TCtx> {
  const {
    name = 'audio',
    onError,
    provider,
    queue = new AudioQueue(),
    runAfter,
    sourceDef = AudioSourceDef,
  } = options;

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

      for (const [id, source] of store.entries()) {
        seen.add(id);

        const signature = sourceSignature(source);
        const current = active.get(id);
        if (current?.signature === signature)
          continue;

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

        if (!current)
          continue;

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
