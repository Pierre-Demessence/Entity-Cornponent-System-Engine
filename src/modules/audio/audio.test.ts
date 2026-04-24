import type { AudioHandle, AudioPlayOptions, AudioProvider } from '#audio-provider';

import type { AudioSystemError } from './audio-system';

import { EcsWorld } from '#world';
import { describe, expect, it } from 'vitest';

import { AudioSourceDef } from './audio-source';
import { AudioQueue, makeAudioSystem } from './audio-system';

interface Ctx { world: EcsWorld }

class FakeAudioProvider implements AudioProvider {
  private nextHandle = 1;

  plays: Array<{ clipId: string; options?: AudioPlayOptions }> = [];
  stops: AudioHandle[] = [];
  throwOnPlayFor = new Set<string>();
  throwOnStopFor = new Set<AudioHandle>();

  dispose(): void {}

  play(clipId: string, options?: AudioPlayOptions): AudioHandle {
    if (this.throwOnPlayFor.has(clipId))
      throw new Error(`play failed for ${clipId}`);
    this.plays.push({ clipId, options });
    return `h${this.nextHandle++}`;
  }

  setVolume(_channel: string, _value: number): void {}

  stop(handle: AudioHandle): void {
    if (this.throwOnStopFor.has(handle))
      throw new Error(`stop failed for ${handle}`);
    this.stops.push(handle);
  }
}

function setup(): { ctx: Ctx; provider: FakeAudioProvider } {
  const world = new EcsWorld();
  world.registerComponent(AudioSourceDef);
  return {
    ctx: { world },
    provider: new FakeAudioProvider(),
  };
}

describe('audioSourceDef', () => {
  it('round-trips optional fields', () => {
    const value = {
      channel: 'sfx',
      clipId: 'laser',
      loop: true,
      volume: 0.3,
    };
    const serialized = AudioSourceDef.serialize(value);
    const restored = AudioSourceDef.deserialize(serialized, 'audioSource');
    expect(restored).toEqual(value);
  });

  it('rejects empty clip id', () => {
    expect(() => AudioSourceDef.deserialize({ clipId: '' }, 'audioSource'))
      .toThrow(/clipId/);
  });

  it('rejects invalid volume range', () => {
    expect(() => AudioSourceDef.deserialize({ clipId: 'laser', volume: 1.2 }, 'audioSource'))
      .toThrow(/volume/);
  });

  it('rejects empty channel', () => {
    expect(() => AudioSourceDef.deserialize({ channel: '  ', clipId: 'laser' }, 'audioSource'))
      .toThrow(/channel/);
  });
});

describe('audioQueue', () => {
  it('drains pending one-shots and clears queue', () => {
    const queue = new AudioQueue();
    queue.play('a', { volume: 0.4 });
    queue.play('b');

    const firstDrain = queue.drain();
    const secondDrain = queue.drain();

    expect(firstDrain).toEqual([
      { clipId: 'a', options: { volume: 0.4 } },
      { clipId: 'b', options: undefined },
    ]);
    expect(secondDrain).toEqual([]);
  });
});

describe('makeAudioSystem', () => {
  it('uses default name and accepts runAfter', () => {
    const queue = new AudioQueue();
    const provider = new FakeAudioProvider();
    const system = makeAudioSystem<Ctx>({ provider, queue, runAfter: ['spawn'] });

    expect(system.name).toBe('audio');
    expect(system.runAfter).toEqual(['spawn']);
  });

  it('plays one-shot queue entries', () => {
    const { ctx, provider } = setup();
    const queue = new AudioQueue();
    queue.play('ui-click', { channel: 'ui', volume: 0.6 });
    const system = makeAudioSystem<Ctx>({ provider, queue });

    system.run(ctx);

    expect(provider.plays).toEqual([
      { clipId: 'ui-click', options: { channel: 'ui', volume: 0.6 } },
    ]);
  });

  it('plays new AudioSource entities exactly once until they change', () => {
    const { ctx, provider } = setup();
    const system = makeAudioSystem<Ctx>({ provider });

    const id = ctx.world.createEntity();
    ctx.world.getStore(AudioSourceDef).set(id, { clipId: 'ambience', loop: true, volume: 0.5 });

    system.run(ctx);
    system.run(ctx);

    expect(provider.plays).toHaveLength(1);
    expect(provider.plays[0]).toEqual({
      clipId: 'ambience',
      options: { channel: undefined, loop: true, volume: 0.5 },
    });
  });

  it('replaces playback when AudioSource changes', () => {
    const { ctx, provider } = setup();
    const system = makeAudioSystem<Ctx>({ provider });
    const store = ctx.world.getStore(AudioSourceDef);

    const id = ctx.world.createEntity();
    store.set(id, { clipId: 'wind', loop: true });
    system.run(ctx);

    store.set(id, { channel: 'music', clipId: 'theme', loop: true, volume: 0.7 });
    system.run(ctx);

    expect(provider.plays).toHaveLength(2);
    expect(provider.stops).toEqual(['h1']);
    expect(provider.plays[1]).toEqual({
      clipId: 'theme',
      options: { channel: 'music', loop: true, volume: 0.7 },
    });
  });

  it('stops playback when AudioSource is removed', () => {
    const { ctx, provider } = setup();
    const system = makeAudioSystem<Ctx>({ provider });
    const store = ctx.world.getStore(AudioSourceDef);

    const id = ctx.world.createEntity();
    store.set(id, { clipId: 'burn' });
    system.run(ctx);

    store.delete(id);
    system.run(ctx);

    expect(provider.stops).toEqual(['h1']);
  });

  it('requeues failed one-shots and reports errors', () => {
    const { ctx, provider } = setup();
    const errors: AudioSystemError[] = [];
    const queue = new AudioQueue();
    queue.play('missing');
    provider.throwOnPlayFor.add('missing');

    const system = makeAudioSystem<Ctx>({
      provider,
      queue,
      onError: error => errors.push(error),
    });

    system.run(ctx);

    expect(provider.plays).toEqual([]);
    expect(errors).toEqual([
      expect.objectContaining({ clipId: 'missing', kind: 'one-shot-play' }),
    ]);

    provider.throwOnPlayFor.delete('missing');
    system.run(ctx);

    expect(provider.plays).toEqual([{ clipId: 'missing', options: undefined }]);
  });

  it('keeps prior source playback active when replacement play fails', () => {
    const { ctx, provider } = setup();
    const errors: AudioSystemError[] = [];
    const system = makeAudioSystem<Ctx>({
      provider,
      onError: error => errors.push(error),
    });
    const store = ctx.world.getStore(AudioSourceDef);

    const id = ctx.world.createEntity();
    store.set(id, { clipId: 'wind', loop: true });
    system.run(ctx);

    provider.throwOnPlayFor.add('theme');
    store.set(id, { clipId: 'theme', loop: true });
    system.run(ctx);

    expect(provider.plays).toEqual([
      { clipId: 'wind', options: { channel: undefined, loop: true, volume: undefined } },
    ]);
    expect(provider.stops).toEqual([]);
    expect(errors).toEqual([
      expect.objectContaining({ clipId: 'theme', entityId: id, kind: 'source-play' }),
    ]);
  });

  it('tracks the new handle when replacement stop fails and avoids replay storms', () => {
    const { ctx, provider } = setup();
    const errors: AudioSystemError[] = [];
    const system = makeAudioSystem<Ctx>({
      provider,
      onError: error => errors.push(error),
    });
    const store = ctx.world.getStore(AudioSourceDef);

    const id = ctx.world.createEntity();
    store.set(id, { clipId: 'wind', loop: true });
    system.run(ctx);

    provider.throwOnStopFor.add('h1');
    store.set(id, { clipId: 'theme', loop: true });
    system.run(ctx);
    system.run(ctx);

    expect(provider.plays).toEqual([
      { clipId: 'wind', options: { channel: undefined, loop: true, volume: undefined } },
      { clipId: 'theme', options: { channel: undefined, loop: true, volume: undefined } },
    ]);
    expect(errors[0]).toEqual(expect.objectContaining({ entityId: id, kind: 'source-stop' }));
  });

  it('reports stop failures when removing tracked sources', () => {
    const { ctx, provider } = setup();
    const errors: AudioSystemError[] = [];
    const system = makeAudioSystem<Ctx>({
      provider,
      onError: error => errors.push(error),
    });
    const store = ctx.world.getStore(AudioSourceDef);

    const id = ctx.world.createEntity();
    store.set(id, { clipId: 'burn' });
    system.run(ctx);

    provider.throwOnStopFor.add('h1');
    store.delete(id);
    system.run(ctx);

    provider.throwOnStopFor.delete('h1');
    system.run(ctx);

    expect(errors[0]).toEqual(expect.objectContaining({ entityId: id, kind: 'source-stop' }));
    expect(provider.stops).toEqual(['h1']);
  });
});
