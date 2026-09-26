import type { TickInfo } from '#tick-source';

import { describe, expect, it, vi } from 'vitest';

import { FixedAccumulatorTickSource } from './fixed-accumulator-tick-source';

describe('fixedAccumulatorTickSource', () => {
  it('emits no tick when accumulated time is below one step', () => {
    const source = new FixedAccumulatorTickSource({ fixedDtMs: 16 });
    const fn = vi.fn();
    source.subscribe(fn);

    source.advance(10);

    expect(fn).not.toHaveBeenCalled();
    expect(source.alpha).toBeCloseTo(10 / 16);
  });

  it('emits exactly one step with alpha 0 when a full dt elapses', () => {
    const source = new FixedAccumulatorTickSource({ fixedDtMs: 16 });
    const received: TickInfo[] = [];
    source.subscribe(info => received.push(info));

    source.advance(16);

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ deltaMs: 16, kind: 'fixed', tickNumber: 0 });
    expect(source.alpha).toBe(0);
  });

  it('emits two steps and keeps the fractional remainder as alpha', () => {
    const source = new FixedAccumulatorTickSource({ fixedDtMs: 10 });
    const fn = vi.fn();
    source.subscribe(fn);

    source.advance(25);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(source.alpha).toBeCloseTo(0.5);
  });

  it('accumulates leftover across calls before firing the next step', () => {
    const source = new FixedAccumulatorTickSource({ fixedDtMs: 10 });
    const fn = vi.fn();
    source.subscribe(fn);

    source.advance(6);
    expect(fn).not.toHaveBeenCalled();
    source.advance(6);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(source.alpha).toBeCloseTo(0.2);
  });

  it('clamps catch-up to maxStepsPerFrame and drops the excess time', () => {
    const source = new FixedAccumulatorTickSource({ fixedDtMs: 10, maxStepsPerFrame: 2 });
    const fn = vi.fn();
    source.subscribe(fn);

    source.advance(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(source.alpha).toBeLessThan(1);

    // Repeated oversized frames never emit more than the cap, and the
    // remainder must not accumulate into an ever-growing backlog.
    source.advance(100);
    expect(fn).toHaveBeenCalledTimes(4);
    expect(source.alpha).toBeLessThan(1);

    source.advance(100);
    expect(fn).toHaveBeenCalledTimes(6);
    expect(source.alpha).toBeLessThan(1);
  });

  it('preserves the sub-step fractional remainder when the clamp drops excess', () => {
    const source = new FixedAccumulatorTickSource({ fixedDtMs: 10, maxStepsPerFrame: 2 });
    const fn = vi.fn();
    source.subscribe(fn);

    // 105ms owes 10 steps but the cap is 2; the excess whole steps are
    // dropped while the 5ms sub-step remainder survives as alpha.
    source.advance(105);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(source.alpha).toBeCloseTo(0.5);
  });

  it('ignores zero, negative, and non-finite deltas', () => {
    const source = new FixedAccumulatorTickSource({ fixedDtMs: 16 });
    const fn = vi.fn();
    source.subscribe(fn);

    source.advance(0);
    source.advance(-16);
    source.advance(Number.NaN);
    source.advance(Infinity);

    expect(fn).not.toHaveBeenCalled();
    expect(source.alpha).toBe(0);
  });

  it('keeps tickNumber monotonic across advance calls', () => {
    const source = new FixedAccumulatorTickSource({ fixedDtMs: 10 });
    const received: TickInfo[] = [];
    source.subscribe(info => received.push(info));

    source.advance(20);
    source.advance(10);
    source.advance(10);

    expect(received.map(i => i.tickNumber)).toEqual([0, 1, 2, 3]);
    expect(source.tickNumber).toBe(3);
  });

  it('exposes tickNumber (-1 before first tick)', () => {
    const source = new FixedAccumulatorTickSource({ fixedDtMs: 10 });
    expect(source.tickNumber).toBe(-1);

    source.advance(10);
    expect(source.tickNumber).toBe(0);
  });

  it('start() and stop() are idempotent no-ops', () => {
    const source = new FixedAccumulatorTickSource({ fixedDtMs: 10 });
    const fn = vi.fn();
    source.subscribe(fn);

    source.start();
    source.start();
    source.stop();
    source.stop();
    expect(fn).not.toHaveBeenCalled();

    source.advance(10);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not reset tickNumber on stop()', () => {
    const source = new FixedAccumulatorTickSource({ fixedDtMs: 10 });
    source.subscribe(() => {});

    source.advance(20);
    expect(source.tickNumber).toBe(1);

    source.stop();
    expect(source.tickNumber).toBe(1);

    source.advance(10);
    expect(source.tickNumber).toBe(2);
  });

  it('supports multiple subscribers with independent unsubscribe', () => {
    const source = new FixedAccumulatorTickSource({ fixedDtMs: 10 });
    const a = vi.fn();
    const b = vi.fn();
    source.subscribe(a);
    const unsubB = source.subscribe(b);

    source.advance(10);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    unsubB();
    source.advance(10);
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid fixedDtMs', () => {
    expect(() => new FixedAccumulatorTickSource({ fixedDtMs: 0 })).toThrow(/positive finite/);
    expect(() => new FixedAccumulatorTickSource({ fixedDtMs: -10 })).toThrow(/positive finite/);
    expect(() => new FixedAccumulatorTickSource({ fixedDtMs: Number.NaN })).toThrow(/positive finite/);
    expect(() => new FixedAccumulatorTickSource({ fixedDtMs: Infinity })).toThrow(/positive finite/);
  });

  it('rejects invalid maxStepsPerFrame', () => {
    expect(() => new FixedAccumulatorTickSource({ fixedDtMs: 10, maxStepsPerFrame: 0 })).toThrow(/positive integer/);
    expect(() => new FixedAccumulatorTickSource({ fixedDtMs: 10, maxStepsPerFrame: -1 })).toThrow(/positive integer/);
    expect(() => new FixedAccumulatorTickSource({ fixedDtMs: 10, maxStepsPerFrame: 1.5 })).toThrow(/positive integer/);
    expect(() => new FixedAccumulatorTickSource({ fixedDtMs: 10, maxStepsPerFrame: Number.NaN })).toThrow(/positive integer/);
  });
});
