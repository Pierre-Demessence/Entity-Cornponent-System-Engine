import { describe, expect, it } from 'vitest';

import { easeInQuad, easeOutQuad } from '../easing';
import { makeTween, resetTween, tickTween, tweenDone, tweenValue } from './tween';

describe('makeTween', () => {
  it('starts at `from` (fraction 0) with linear default', () => {
    const tw = makeTween(1000, 10, 20);
    expect(tweenValue(tw)).toBe(10);
    expect(tweenDone(tw)).toBe(false);
  });
});

describe('tickTween (linear)', () => {
  it('interpolates linearly across the duration', () => {
    const tw = makeTween(1000, 0, 100);
    expect(tickTween(tw, 250)).toBeCloseTo(25, 10);
    expect(tickTween(tw, 250)).toBeCloseTo(50, 10);
    expect(tickTween(tw, 500)).toBeCloseTo(100, 10);
    expect(tweenDone(tw)).toBe(true);
  });

  it('clamps at `to` once finished (once mode)', () => {
    const tw = makeTween(100, 0, 5);
    tickTween(tw, 100);
    expect(tweenValue(tw)).toBe(5);
    expect(tickTween(tw, 50)).toBe(5); // no overshoot past `to`
    expect(tweenDone(tw)).toBe(true);
  });

  it('supports a descending range', () => {
    const tw = makeTween(100, 1, 0);
    expect(tickTween(tw, 50)).toBeCloseTo(0.5, 10);
    expect(tickTween(tw, 50)).toBeCloseTo(0, 10);
  });
});

describe('tickTween (eased)', () => {
  it('applies the easing curve to progress', () => {
    const tw = makeTween(100, 0, 100, easeInQuad);
    // easeInQuad(0.5) = 0.25 → value 25.
    expect(tickTween(tw, 50)).toBeCloseTo(25, 10);
  });

  it('eases out toward the end', () => {
    const tw = makeTween(100, 0, 100, easeOutQuad);
    // easeOutQuad(0.5) = 0.75 → value 75.
    expect(tickTween(tw, 50)).toBeCloseTo(75, 10);
  });
});

describe('repeating mode', () => {
  it('wraps and keeps animating', () => {
    const tw = makeTween(100, 0, 100, undefined, 'repeating');
    tickTween(tw, 100); // wraps to full; justFinished edge
    expect(tweenDone(tw)).toBe(true);
    const v = tickTween(tw, 30);
    expect(v).toBeCloseTo(30, 10);
    expect(tweenDone(tw)).toBe(false);
  });
});

describe('resetTween', () => {
  it('restarts from the beginning', () => {
    const tw = makeTween(100, 0, 100);
    tickTween(tw, 100);
    expect(tweenValue(tw)).toBe(100);
    resetTween(tw);
    expect(tweenValue(tw)).toBe(0);
  });

  it('retargets from/to and duration in one call', () => {
    const tw = makeTween(100, 0, 100);
    tickTween(tw, 100);
    resetTween(tw, { durationMs: 200, from: 50, to: 60 });
    expect(tweenValue(tw)).toBe(50);
    expect(tickTween(tw, 100)).toBeCloseTo(55, 10); // halfway of 200ms
    expect(tickTween(tw, 100)).toBeCloseTo(60, 10);
  });
});
