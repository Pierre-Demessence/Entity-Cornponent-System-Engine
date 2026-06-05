import { describe, expect, it } from 'vitest';

import {
  finished,
  fraction,
  justFinished,
  makeTimer,
  restart,
  tickTimer,
} from './timer';

describe('makeTimer', () => {
  it('starts full and unfinished, defaulting to once', () => {
    const t = makeTimer(1000);
    expect(t).toEqual({
      durationMs: 1000,
      justFinished: false,
      mode: 'once',
      remainingMs: 1000,
    });
  });

  it('accepts a repeating mode', () => {
    expect(makeTimer(500, 'repeating').mode).toBe('repeating');
  });
});

describe('tickTimer (once)', () => {
  it('decrements remaining by dt', () => {
    const t = makeTimer(100);
    tickTimer(t, 16);
    expect(t.remainingMs).toBe(84);
    expect(t.justFinished).toBe(false);
  });

  it('clamps to zero and sets justFinished on the crossing tick', () => {
    const t = makeTimer(10);
    tickTimer(t, 16);
    expect(t.remainingMs).toBe(0);
    expect(t.justFinished).toBe(true);
    expect(finished(t)).toBe(true);
  });

  it('latches finished and clears justFinished on later ticks', () => {
    const t = makeTimer(10);
    tickTimer(t, 16);
    tickTimer(t, 16);
    expect(t.remainingMs).toBe(0);
    expect(t.justFinished).toBe(false);
    expect(finished(t)).toBe(true);
    expect(justFinished(t)).toBe(false);
  });
});

describe('tickTimer (repeating)', () => {
  it('wraps and signals justFinished on the wrap tick', () => {
    const t = makeTimer(100, 'repeating');
    tickTimer(t, 100);
    expect(t.remainingMs).toBe(100);
    expect(t.justFinished).toBe(true);
    expect(finished(t)).toBe(true);
  });

  it('reports not-finished between wraps', () => {
    const t = makeTimer(100, 'repeating');
    tickTimer(t, 40);
    expect(t.remainingMs).toBe(60);
    expect(finished(t)).toBe(false);
  });

  it('coalesces multiple wraps in one tick into a single justFinished', () => {
    const t = makeTimer(100, 'repeating');
    tickTimer(t, 250);
    expect(t.remainingMs).toBe(50);
    expect(t.justFinished).toBe(true);
  });

  it('guards against a zero-duration timer', () => {
    const t = makeTimer(0, 'repeating');
    tickTimer(t, 16);
    expect(t.remainingMs).toBe(0);
    expect(t.justFinished).toBe(false);
  });
});

describe('fraction', () => {
  it('is 0 at full and 1 at zero', () => {
    const t = makeTimer(100);
    expect(fraction(t)).toBe(0);
    tickTimer(t, 100);
    expect(fraction(t)).toBe(1);
  });

  it('reports elapsed progress mid-countdown', () => {
    const t = makeTimer(100);
    tickTimer(t, 25);
    expect(fraction(t)).toBeCloseTo(0.25);
  });

  it('is 1 for a zero-duration timer', () => {
    expect(fraction(makeTimer(0))).toBe(1);
  });
});

describe('restart', () => {
  it('resets remaining to duration and clears justFinished', () => {
    const t = makeTimer(100);
    tickTimer(t, 100);
    restart(t);
    expect(t.remainingMs).toBe(100);
    expect(t.justFinished).toBe(false);
    expect(finished(t)).toBe(false);
  });

  it('can change the duration', () => {
    const t = makeTimer(100);
    restart(t, 250);
    expect(t.durationMs).toBe(250);
    expect(t.remainingMs).toBe(250);
  });
});
