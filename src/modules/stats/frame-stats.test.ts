import { describe, expect, it } from 'vitest';

import { FrameStats } from './frame-stats';

describe('frameStats', () => {
  it('reports the last frame and derives fps', () => {
    const s = new FrameStats();
    s.sample(20);
    expect(s.ms).toBe(20);
    expect(s.fps).toBeCloseTo(50, 5);
  });

  it('returns zeros before any sample (no NaN)', () => {
    const s = new FrameStats();
    expect(s.ms).toBe(0);
    expect(s.fps).toBe(0);
    expect(s.avgMs).toBe(0);
    expect(s.minMs).toBe(0);
    expect(s.maxMs).toBe(0);
    expect(s.avgFps).toBe(0);
    expect(s.minFps).toBe(0);
    expect(s.maxFps).toBe(0);
    expect(s.low1Fps).toBe(0);
    expect(s.low01Fps).toBe(0);
    expect(s.history).toEqual([]);
  });

  it('ignores non-positive and non-finite deltas', () => {
    const s = new FrameStats();
    s.sample(0);
    s.sample(-5);
    s.sample(Number.NaN);
    s.sample(Number.POSITIVE_INFINITY);
    expect(s.history).toEqual([]);
    expect(s.ms).toBe(0);
  });

  it('computes avg/min/max over the window', () => {
    const s = new FrameStats({ historySize: 16, windowMs: 10_000 });
    s.sample(10);
    s.sample(20);
    s.sample(30);
    expect(s.avgMs).toBeCloseTo(20, 5);
    expect(s.minMs).toBe(10);
    expect(s.maxMs).toBe(30);
    // min fps from worst frame, max fps from best frame
    expect(s.minFps).toBeCloseTo(1000 / 30, 5);
    expect(s.maxFps).toBeCloseTo(1000 / 10, 5);
    expect(s.avgFps).toBeCloseTo(50, 5);
  });

  it('evicts samples older than the window', () => {
    const s = new FrameStats({ historySize: 64, windowMs: 100 });
    // Each sample advances the internal clock by its own delta.
    for (let i = 0; i < 10; i++)
      s.sample(20); // clock advances 20ms each → 200ms total
    // Window is 100ms, so only the most recent ~5 samples (100ms) survive.
    expect(s.history.length).toBeLessThanOrEqual(6);
    expect(s.history.length).toBeGreaterThanOrEqual(5);
    // All retained samples are 20ms.
    expect(s.avgMs).toBeCloseTo(20, 5);
  });

  it('keeps history oldest→newest and bounded by capacity', () => {
    const s = new FrameStats({ historySize: 3, windowMs: 1_000_000 });
    s.sample(1);
    s.sample(2);
    s.sample(3);
    s.sample(4);
    // Capacity 3 → oldest (1) dropped; order preserved.
    expect(s.history).toEqual([2, 3, 4]);
  });

  it('computes 1% and 0.1% lows from the worst frames', () => {
    const s = new FrameStats({ historySize: 1000, windowMs: 1_000_000 });
    // 990 fast frames at 10ms, 10 slow 100ms hitches (the worst 1%).
    for (let i = 0; i < 990; i++)
      s.sample(10);
    for (let i = 0; i < 10; i++)
      s.sample(100);
    // Sorted: indices 0..989 are 10ms, 990..999 are 100ms.
    // 99.9th percentile (rank 998) lands in the 100ms tail → ~10 fps.
    expect(s.low01Fps).toBeCloseTo(1000 / 100, 1);
    // 99th percentile (rank 989) is the last 10ms frame → ~100 fps.
    expect(s.low1Fps).toBeCloseTo(1000 / 10, 1);
  });

  it('percentile lows fall back gracefully with a single sample', () => {
    const s = new FrameStats();
    s.sample(25);
    expect(s.low1Fps).toBeCloseTo(1000 / 25, 5);
    expect(s.low01Fps).toBeCloseTo(1000 / 25, 5);
  });

  it('reset clears samples and counters', () => {
    const s = new FrameStats();
    s.sample(16);
    s.setCounter('enemies', 42);
    s.reset();
    expect(s.ms).toBe(0);
    expect(s.history).toEqual([]);
    expect(s.counters.size).toBe(0);
  });

  it('stores and overwrites named counters', () => {
    const s = new FrameStats();
    s.setCounter('enemies', 10);
    s.setCounter('bullets', 4000);
    s.setCounter('enemies', 12);
    expect(s.counters.get('enemies')).toBe(12);
    expect(s.counters.get('bullets')).toBe(4000);
    expect(s.counters.size).toBe(2);
  });

  it('handles a window smaller than one frame (keeps the latest)', () => {
    const s = new FrameStats({ historySize: 8, windowMs: 5 });
    s.sample(20); // single 20ms frame, clock=20, cutoff=15 → its stamp 20 >= 15 survives
    expect(s.history).toEqual([20]);
    s.sample(20); // clock=40, cutoff=35; first stamp 20 < 35 evicted, second 40 >= 35 kept
    expect(s.history).toEqual([20]);
    expect(s.maxMs).toBe(20);
  });
});
