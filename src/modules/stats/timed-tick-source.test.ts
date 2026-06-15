import type { TickInfo, TickSource } from '#tick-source';

import { describe, expect, it, vi } from 'vitest';

import { FrameStats } from './frame-stats';
import { TimedTickSource } from './timed-tick-source';

/** A manually-pumped TickSource for deterministic tests. */
function fakeSource(): TickSource & { emit: (info: TickInfo) => void } {
  const handlers = new Set<(info: TickInfo) => void>();
  return {
    start: vi.fn(),
    stop: vi.fn(),
    emit(info) {
      for (const h of handlers) h(info);
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}

describe('timedTickSource', () => {
  it('measures the wall-clock span of subscriber handling into FrameStats', () => {
    const inner = fakeSource();
    const stats = new FrameStats();
    let clock = 0;
    const now = (): number => clock;
    const timed = new TimedTickSource(inner, stats, now);

    let observed: TickInfo | null = null;
    timed.subscribe((info) => {
      clock += 5; // simulate 5ms of work
      observed = info;
    });
    timed.start();

    const info: TickInfo = { deltaMs: 16.67, kind: 'fixed', tickNumber: 0 };
    inner.emit(info);

    expect(stats.ms).toBeCloseTo(5, 5);
    expect(observed).toEqual(info); // original info forwarded unchanged
  });

  it('delegates start/stop to the inner source', () => {
    const inner = fakeSource();
    const timed = new TimedTickSource(inner, new FrameStats());
    timed.start();
    timed.stop();
    expect(inner.start).toHaveBeenCalledTimes(1);
    expect(inner.stop).toHaveBeenCalledTimes(1);
  });

  it('stops sampling after stop()', () => {
    const inner = fakeSource();
    const stats = new FrameStats();
    let clock = 0;
    const timed = new TimedTickSource(inner, stats, () => clock);
    timed.subscribe(() => {
      clock += 3;
    });
    timed.start();
    timed.stop();
    inner.emit({ deltaMs: 16, kind: 'fixed', tickNumber: 0 });
    // Internal sampling bracket removed on stop → no sample recorded.
    expect(stats.ms).toBe(0);
  });
});
