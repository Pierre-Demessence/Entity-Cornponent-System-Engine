import type { TickInfo } from '#tick-source';

import { describe, expect, it, vi } from 'vitest';

import { ManualTickSource } from './manual-tick-source';

describe('manualTickSource', () => {
  it('fires subscribers with a monotonic tickNumber starting at 0', () => {
    const source = new ManualTickSource();
    const received: TickInfo[] = [];
    source.subscribe(info => received.push(info));

    source.tick();
    source.tick();
    source.tick();

    expect(received.map(i => i.tickNumber)).toEqual([0, 1, 2]);
    expect(received.every(i => i.kind === 'discrete')).toBe(true);
    expect(received.every(i => i.deltaMs === undefined)).toBe(true);
  });

  it('supports multiple subscribers', () => {
    const source = new ManualTickSource();
    const a = vi.fn();
    const b = vi.fn();
    source.subscribe(a);
    source.subscribe(b);

    source.tick();

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a.mock.calls[0][0]).toEqual(b.mock.calls[0][0]);
  });

  it('unsubscribes cleanly', () => {
    const source = new ManualTickSource();
    const fn = vi.fn();
    const unsub = source.subscribe(fn);

    source.tick();
    unsub();
    source.tick();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('exposes the last-emitted tickNumber via the getter (-1 before first tick)', () => {
    const source = new ManualTickSource();
    expect(source.tickNumber).toBe(-1);
    source.tick();
    expect(source.tickNumber).toBe(0);
    source.tick();
    expect(source.tickNumber).toBe(1);
  });

  it('start/stop are idempotent no-ops', () => {
    const source = new ManualTickSource();
    expect(() => {
      source.start();
      source.start();
      source.stop();
      source.stop();
    }).not.toThrow();
    source.tick();
    expect(source.tickNumber).toBe(0);
  });
});
