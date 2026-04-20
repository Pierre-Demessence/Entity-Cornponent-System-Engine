import type { TickInfo } from '#tick-source';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FixedIntervalTickSource } from './fixed-interval-tick-source';

describe('fixedIntervalTickSource', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires subscribers at the configured interval with monotonic tickNumber', () => {
    const source = new FixedIntervalTickSource(100);
    const received: TickInfo[] = [];
    source.subscribe(info => received.push(info));

    source.start();
    vi.advanceTimersByTime(350);

    expect(received.map(i => i.tickNumber)).toEqual([0, 1, 2]);
    expect(received.every(i => i.kind === 'fixed')).toBe(true);
    expect(received.every(i => i.deltaMs === 100)).toBe(true);
  });

  it('does not fire before start() is called', () => {
    const source = new FixedIntervalTickSource(50);
    const fn = vi.fn();
    source.subscribe(fn);

    vi.advanceTimersByTime(500);

    expect(fn).not.toHaveBeenCalled();
  });

  it('stop() halts emission; re-start() resumes with continued tickNumber', () => {
    const source = new FixedIntervalTickSource(100);
    const fn = vi.fn();
    source.subscribe(fn);

    source.start();
    vi.advanceTimersByTime(250);
    expect(fn).toHaveBeenCalledTimes(2);

    source.stop();
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(2);

    source.start();
    vi.advanceTimersByTime(150);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(source.tickNumber).toBe(2);
  });

  it('start()/stop() are idempotent', () => {
    const source = new FixedIntervalTickSource(100);
    const fn = vi.fn();
    source.subscribe(fn);

    source.start();
    source.start();
    source.start();
    vi.advanceTimersByTime(250);

    expect(fn).toHaveBeenCalledTimes(2);

    source.stop();
    source.stop();
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('supports multiple subscribers with independent unsubscribe', () => {
    const source = new FixedIntervalTickSource(50);
    const a = vi.fn();
    const b = vi.fn();
    source.subscribe(a);
    const unsubB = source.subscribe(b);

    source.start();
    vi.advanceTimersByTime(100);
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(2);

    unsubB();
    vi.advanceTimersByTime(100);
    expect(a).toHaveBeenCalledTimes(4);
    expect(b).toHaveBeenCalledTimes(2);

    source.stop();
  });

  it('rejects invalid intervalMs', () => {
    expect(() => new FixedIntervalTickSource(0)).toThrow(/positive finite/);
    expect(() => new FixedIntervalTickSource(-10)).toThrow(/positive finite/);
    expect(() => new FixedIntervalTickSource(Number.NaN)).toThrow(/positive finite/);
    expect(() => new FixedIntervalTickSource(Infinity)).toThrow(/positive finite/);
  });

  it('exposes tickNumber (-1 before first tick)', () => {
    const source = new FixedIntervalTickSource(100);
    expect(source.tickNumber).toBe(-1);

    source.start();
    vi.advanceTimersByTime(250);
    expect(source.tickNumber).toBe(1);

    source.stop();
  });

  it('handler can unsubscribe itself during emit without corrupting iteration', () => {
    const source = new FixedIntervalTickSource(100);
    const aCalls: number[] = [];
    const bCalls: number[] = [];
    const cCalls: number[] = [];

    source.subscribe(info => aCalls.push(info.tickNumber));
    const unsubB = source.subscribe((info) => {
      bCalls.push(info.tickNumber);
      if (info.tickNumber === 1)
        unsubB();
    });
    source.subscribe(info => cCalls.push(info.tickNumber));

    source.start();
    vi.advanceTimersByTime(350);

    expect(aCalls).toEqual([0, 1, 2]);
    expect(bCalls).toEqual([0, 1]);
    expect(cCalls).toEqual([0, 1, 2]);

    source.stop();
  });

  it('does not create a timer before start() is called', () => {
    const setSpy = vi.spyOn(globalThis, 'setInterval');
    const source = new FixedIntervalTickSource(100);

    expect(setSpy).not.toHaveBeenCalled();

    source.start();
    expect(setSpy).toHaveBeenCalledTimes(1);

    source.stop();
    setSpy.mockRestore();
  });
});
