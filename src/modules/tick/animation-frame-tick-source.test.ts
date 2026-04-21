import { beforeEach, describe, expect, it } from 'vitest';

import { AnimationFrameTickSource } from './animation-frame-tick-source';

interface FakeRaf {
  nextId: number;
  pending: Map<number, FrameRequestCallback>;
  cancelRaf: (id: number) => void;
  /** Fires the next scheduled rAF callback with the given timestamp. */
  flush: (timeMs: number) => void;
  raf: (cb: FrameRequestCallback) => number;
}

function makeFakeRaf(): FakeRaf {
  const pending = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  return {
    pending,
    get nextId() { return nextId; },
    set nextId(value: number) { nextId = value; },
    cancelRaf: (id: number): void => {
      pending.delete(id);
    },
    flush: (timeMs: number): void => {
      const entry = [...pending.entries()][0];
      if (!entry)
        throw new Error('flush called with no pending rAF callback');
      const [id, cb] = entry;
      pending.delete(id);
      cb(timeMs);
    },
    raf: (cb: FrameRequestCallback): number => {
      const id = nextId++;
      pending.set(id, cb);
      return id;
    },
  };
}

describe('animationFrameTickSource', () => {
  let fake: FakeRaf;

  beforeEach(() => {
    fake = makeFakeRaf();
  });

  it('emits variable-rate ticks with measured deltaMs', () => {
    const src = new AnimationFrameTickSource({ cancelRaf: fake.cancelRaf, raf: fake.raf });
    const received: Array<{ deltaMs?: number; tickNumber: number }> = [];
    src.subscribe(info => received.push({ deltaMs: info.deltaMs, tickNumber: info.tickNumber }));

    src.start();
    fake.flush(100);
    fake.flush(117);
    fake.flush(133);

    expect(received).toEqual([
      { deltaMs: 0, tickNumber: 0 },
      { deltaMs: 17, tickNumber: 1 },
      { deltaMs: 16, tickNumber: 2 },
    ]);
  });

  it('reports variable kind', () => {
    const src = new AnimationFrameTickSource({ cancelRaf: fake.cancelRaf, raf: fake.raf });
    let kind: string | undefined;
    src.subscribe((info) => {
      kind = info.kind;
    });

    src.start();
    fake.flush(0);

    expect(kind).toBe('variable');
  });

  it('start is idempotent', () => {
    const src = new AnimationFrameTickSource({ cancelRaf: fake.cancelRaf, raf: fake.raf });
    src.start();
    src.start();
    src.start();

    expect(fake.pending.size).toBe(1);
  });

  it('stop is idempotent and cancels the pending frame', () => {
    const src = new AnimationFrameTickSource({ cancelRaf: fake.cancelRaf, raf: fake.raf });
    src.start();
    expect(fake.pending.size).toBe(1);

    src.stop();
    src.stop();
    expect(fake.pending.size).toBe(0);
  });

  it('resets delta baseline after stop/restart', () => {
    const src = new AnimationFrameTickSource({ cancelRaf: fake.cancelRaf, raf: fake.raf });
    const deltas: number[] = [];
    src.subscribe((info) => {
      if (info.deltaMs !== undefined)
        deltas.push(info.deltaMs);
    });

    src.start();
    fake.flush(100);
    fake.flush(120);
    src.stop();

    src.start();
    fake.flush(500);
    fake.flush(520);

    // First tick after (re)start has delta 0 (no previous frame to measure).
    expect(deltas).toEqual([0, 20, 0, 20]);
  });

  it('throws with a helpful message when no rAF is available', () => {
    const globalRef = globalThis as {
      requestAnimationFrame?: unknown;
      cancelAnimationFrame?: unknown;
    };
    const origRaf = globalRef.requestAnimationFrame;
    const origCancel = globalRef.cancelAnimationFrame;
    try {
      delete globalRef.requestAnimationFrame;
      delete globalRef.cancelAnimationFrame;
      expect(() => new AnimationFrameTickSource()).toThrow(/requestAnimationFrame/);
    }
    finally {
      if (origRaf !== undefined)
        globalRef.requestAnimationFrame = origRaf;
      if (origCancel !== undefined)
        globalRef.cancelAnimationFrame = origCancel;
    }
  });

  it('unsubscribed handlers stop receiving ticks', () => {
    const src = new AnimationFrameTickSource({ cancelRaf: fake.cancelRaf, raf: fake.raf });
    let count = 0;
    const unsub = src.subscribe(() => {
      count++;
    });

    src.start();
    fake.flush(0);
    expect(count).toBe(1);

    unsub();
    fake.flush(10);
    expect(count).toBe(1);
  });

  it('isolates subscriber errors: one throw does not stop the loop or starve other subscribers', () => {
    const src = new AnimationFrameTickSource({ cancelRaf: fake.cancelRaf, raf: fake.raf });
    const originalError = console.error;
    const errorCalls: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      errorCalls.push(args);
    };
    try {
      let goodCalls = 0;
      src.subscribe(() => {
        throw new Error('boom');
      });
      src.subscribe(() => {
        goodCalls++;
      });

      src.start();
      fake.flush(0);
      fake.flush(16);

      expect(goodCalls).toBe(2);
      expect(fake.pending.size).toBe(1);
      expect(errorCalls.length).toBe(2);
    }
    finally {
      console.error = originalError;
    }
  });
});
