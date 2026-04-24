import { describe, expect, it } from 'vitest';

import { WebAudioProvider } from './web-audio-provider';

interface FakeGainNode {
  connectCalls: number;
  disconnectCalls: number;
  gain: { value: number };
  connect: (_target: unknown) => void;
  disconnect: () => void;
}

interface FakeBufferSourceNode {
  buffer: AudioBuffer | null;
  connectCalls: number;
  disconnectCalls: number;
  loop: boolean;
  onended: AudioBufferSourceNode['onended'];
  startCalls: number[];
  stopCalls: number;
  connect: (_target: unknown) => void;
  disconnect: () => void;
  start: (when?: number) => void;
  stop: () => void;
}

function createFakeAudioContext(currentTime = 1.5): {
  closeCalls: { count: number };
  context: AudioContext;
  gains: FakeGainNode[];
  sources: FakeBufferSourceNode[];
} {
  const gains: FakeGainNode[] = [];
  const sources: FakeBufferSourceNode[] = [];
  const closeCalls = { count: 0 };

  const context = {
    currentTime,
    destination: {},
    close: () => {
      closeCalls.count += 1;
      return Promise.resolve();
    },
    createBufferSource: () => {
      const source: FakeBufferSourceNode = {
        buffer: null,
        connectCalls: 0,
        disconnectCalls: 0,
        loop: false,
        onended: null,
        startCalls: [],
        stopCalls: 0,
        connect: () => {
          source.connectCalls += 1;
        },
        disconnect: () => {
          source.disconnectCalls += 1;
        },
        start: (when = currentTime) => {
          source.startCalls.push(when);
        },
        stop: () => {
          source.stopCalls += 1;
          if (source.onended) {
            source.onended.call(
              source as unknown as AudioScheduledSourceNode,
              new Event('ended'),
            );
          }
        },
      };
      sources.push(source);
      return source as unknown as AudioBufferSourceNode;
    },
    createGain: () => {
      const gain: FakeGainNode = {
        connectCalls: 0,
        disconnectCalls: 0,
        gain: { value: 1 },
        connect: () => {
          gain.connectCalls += 1;
        },
        disconnect: () => {
          gain.disconnectCalls += 1;
        },
      };
      gains.push(gain);
      return gain as unknown as GainNode;
    },
  } as unknown as AudioContext;

  return {
    closeCalls,
    context,
    gains,
    sources,
  };
}

describe('webAudioProvider', () => {
  it('throws a helpful error when no context is available', () => {
    const globalRef = globalThis as {
      AudioContext?: unknown;
      webkitAudioContext?: unknown;
    };
    const originalAudioContext = globalRef.AudioContext;
    const originalWebkit = globalRef.webkitAudioContext;

    try {
      delete globalRef.AudioContext;
      delete globalRef.webkitAudioContext;
      expect(() => new WebAudioProvider()).toThrow(/no AudioContext available/);
    }
    finally {
      if (originalAudioContext !== undefined)
        globalRef.AudioContext = originalAudioContext;
      else delete globalRef.AudioContext;
      if (originalWebkit !== undefined)
        globalRef.webkitAudioContext = originalWebkit;
      else delete globalRef.webkitAudioContext;
    }
  });

  it('throws for unknown clip ids', () => {
    const { context } = createFakeAudioContext();

    const provider = new WebAudioProvider({ context });
    expect(() => provider.play('missing')).toThrow(/unknown clip id/);
  });

  it('validates delay and volume inputs', () => {
    const { context, sources } = createFakeAudioContext();
    const clip = {} as AudioBuffer;
    const provider = new WebAudioProvider({ clips: { click: clip }, context });

    expect(() => provider.play('click', { delayMs: Number.NaN })).toThrow(/delayMs/);
    expect(() => provider.play('click', { volume: 1.5 })).toThrow(/volume/);
    expect(() => provider.setVolume('music', -0.1)).toThrow(/setVolume/);

    provider.play('click', { channel: 'music', delayMs: -50, volume: 0.5 });
    expect(sources.at(-1)?.startCalls[0]).toBe(1.5);
  });

  it('stops handles idempotently and disconnects nodes on dispose', () => {
    const { closeCalls, context, gains, sources } = createFakeAudioContext();
    const clip = {} as AudioBuffer;
    const provider = new WebAudioProvider({ clips: { click: clip }, context });

    const handle = provider.play('click', { channel: 'sfx' });
    provider.stop(handle);
    provider.stop(handle);
    provider.dispose();

    expect(sources[0]?.stopCalls).toBe(1);
    expect(gains[0]?.disconnectCalls).toBeGreaterThan(0);
    expect(gains.some(g => g.disconnectCalls > 0)).toBe(true);
    expect(closeCalls.count).toBe(0);
  });

  it('closes owned contexts during dispose', () => {
    const globalRef = globalThis as {
      AudioContext?: new () => AudioContext;
      webkitAudioContext?: new () => AudioContext;
    };
    const originalAudioContext = globalRef.AudioContext;
    const originalWebkit = globalRef.webkitAudioContext;

    const fake = createFakeAudioContext();
    const ctor = function AudioContextShim(): AudioContext {
      return fake.context;
    } as unknown as new () => AudioContext;

    try {
      globalRef.AudioContext = ctor;
      delete globalRef.webkitAudioContext;
      const provider = new WebAudioProvider({ clips: { click: {} as AudioBuffer } });
      provider.dispose();
      expect(fake.closeCalls.count).toBe(1);
    }
    finally {
      if (originalAudioContext !== undefined)
        globalRef.AudioContext = originalAudioContext;
      else delete globalRef.AudioContext;
      if (originalWebkit !== undefined)
        globalRef.webkitAudioContext = originalWebkit;
      else delete globalRef.webkitAudioContext;
    }
  });
});
