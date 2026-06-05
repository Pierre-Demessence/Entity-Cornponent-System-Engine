import { describe, expect, it } from 'vitest';

import { makeSpawner, resetSpawner, tickSpawner } from './spawner';

describe('makeSpawner', () => {
  it('defers the first interval until the first tick (lazy seed)', () => {
    let calls = 0;
    const s = makeSpawner(() => {
      calls++;
      return 200;
    });
    // Provider must not run at construction (so it may read state wired later).
    expect(calls).toBe(0);
    let emits = 0;
    tickSpawner(s, 200, () => emits++);
    expect(calls).toBe(2); // seed + reschedule
    expect(emits).toBe(1);
    expect(s.remainingMs).toBe(200);
  });
});

describe('tickSpawner', () => {
  it('does not emit before the interval elapses', () => {
    const s = makeSpawner(() => 100);
    let emits = 0;
    tickSpawner(s, 40, () => emits++);
    expect(emits).toBe(0);
    expect(s.remainingMs).toBe(60);
  });

  it('emits once when the interval is reached and reschedules', () => {
    const s = makeSpawner(() => 100);
    let emits = 0;
    tickSpawner(s, 100, () => emits++);
    expect(emits).toBe(1);
    expect(s.remainingMs).toBe(100);
  });

  it('carries overshoot into the next cycle (drift-free)', () => {
    const s = makeSpawner(() => 100);
    let emits = 0;
    tickSpawner(s, 130, () => emits++);
    expect(emits).toBe(1);
    expect(s.remainingMs).toBe(70);
  });

  it('drains multiple emits when dt spans several intervals', () => {
    const s = makeSpawner(() => 100);
    let emits = 0;
    // first 100 seeded on the first tick; dt 250 crosses 100 and 200.
    tickSpawner(s, 250, () => emits++);
    expect(emits).toBe(2);
    expect(s.remainingMs).toBe(50);
  });

  it('uses a fresh interval each cycle (ramp / jitter)', () => {
    const intervals = [100, 50, 30];
    let i = 0;
    const s = makeSpawner(() => intervals[Math.min(i++, intervals.length - 1)]);
    // first 100 seeded on the first tick; dt 181 crosses the 50 then 30 ramp steps.
    let emits = 0;
    tickSpawner(s, 181, () => emits++);
    expect(emits).toBe(3);
    expect(s.remainingMs).toBe(29);
  });

  it('halts the tick on a non-positive interval (guard)', () => {
    const s = makeSpawner(() => 0);
    let emits = 0;
    tickSpawner(s, 16, () => emits++);
    expect(emits).toBe(1);
    expect(s.remainingMs).toBe(0);
  });

  it('holds reset and emits nothing while the gate is closed', () => {
    const open = false;
    const s = makeSpawner(() => 100, { active: () => open });
    s.remainingMs = 50;
    let emits = 0;
    tickSpawner(s, 100, () => emits++);
    expect(emits).toBe(0);
    expect(s.remainingMs).toBe(0);
  });

  it('fires immediately on the first tick after the gate reopens', () => {
    let open = false;
    const s = makeSpawner(() => 100, { active: () => open });
    tickSpawner(s, 16, () => {});
    open = true;
    let emits = 0;
    tickSpawner(s, 16, () => emits++);
    expect(emits).toBe(1);
  });
  it('emits immediately on the next tick after resetSpawner(s, 0)', () => {
    const s = makeSpawner(() => 100);
    resetSpawner(s, 0);
    let emits = 0;
    tickSpawner(s, 16, () => emits++);
    expect(emits).toBe(1);
  });

  it('caps emits per tick to guard against runaway dt', () => {
    const s = makeSpawner(() => 1);
    let emits = 0;
    tickSpawner(s, 1_000_000, () => emits++);
    expect(emits).toBe(10_000);
  });
});

describe('resetSpawner', () => {
  it('reschedules to a fresh interval by default', () => {
    const s = makeSpawner(() => 100);
    s.remainingMs = -5;
    resetSpawner(s);
    expect(s.remainingMs).toBe(100);
  });

  it('accepts an explicit remaining value', () => {
    const s = makeSpawner(() => 100);
    resetSpawner(s, 0);
    expect(s.remainingMs).toBe(0);
  });
});
