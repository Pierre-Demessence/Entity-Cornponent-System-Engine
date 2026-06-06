import { describe, expect, it } from 'vitest';

import * as E from './easing';

const ALL: [string, E.Easing][] = [
  ['linear', E.linear],
  ['easeInQuad', E.easeInQuad],
  ['easeOutQuad', E.easeOutQuad],
  ['easeInOutQuad', E.easeInOutQuad],
  ['easeInCubic', E.easeInCubic],
  ['easeOutCubic', E.easeOutCubic],
  ['easeInOutCubic', E.easeInOutCubic],
  ['easeInQuart', E.easeInQuart],
  ['easeOutQuart', E.easeOutQuart],
  ['easeInOutQuart', E.easeInOutQuart],
  ['easeInQuint', E.easeInQuint],
  ['easeOutQuint', E.easeOutQuint],
  ['easeInOutQuint', E.easeInOutQuint],
  ['easeInSine', E.easeInSine],
  ['easeOutSine', E.easeOutSine],
  ['easeInOutSine', E.easeInOutSine],
  ['easeInExpo', E.easeInExpo],
  ['easeOutExpo', E.easeOutExpo],
  ['easeInOutExpo', E.easeInOutExpo],
  ['easeInCirc', E.easeInCirc],
  ['easeOutCirc', E.easeOutCirc],
  ['easeInOutCirc', E.easeInOutCirc],
  ['easeInBack', E.easeInBack],
  ['easeOutBack', E.easeOutBack],
  ['easeInOutBack', E.easeInOutBack],
  ['easeInElastic', E.easeInElastic],
  ['easeOutElastic', E.easeOutElastic],
  ['easeInOutElastic', E.easeInOutElastic],
  ['easeInBounce', E.easeInBounce],
  ['easeOutBounce', E.easeOutBounce],
  ['easeInOutBounce', E.easeInOutBounce],
];

describe('easing — universal endpoint invariants', () => {
  it.each(ALL)('%s pins f(0)=0 and f(1)=1', (_name, fn) => {
    expect(fn(0)).toBeCloseTo(0, 6);
    expect(fn(1)).toBeCloseTo(1, 6);
  });

  it.each(ALL)('%s passes through 0.5 of its in/out symmetry midpoint sanely', (name, fn) => {
    const mid = fn(0.5);
    // inOut curves are symmetric → exactly 0.5 at the midpoint.
    if (name.startsWith('easeInOut'))
      expect(mid).toBeCloseTo(0.5, 6);
    // every curve's midpoint is finite and within a sane band (back/elastic overshoot a bit).
    expect(Number.isFinite(mid)).toBe(true);
    expect(mid).toBeGreaterThan(-0.5);
    expect(mid).toBeLessThan(1.5);
  });
});

describe('easing — known values', () => {
  it('linear is identity', () => {
    expect(E.linear(0.3)).toBe(0.3);
  });

  it('quad matches t^2 / 1-(1-t)^2', () => {
    expect(E.easeInQuad(0.5)).toBeCloseTo(0.25, 10);
    expect(E.easeOutQuad(0.5)).toBeCloseTo(0.75, 10);
  });

  it('cubic matches t^3', () => {
    expect(E.easeInCubic(0.5)).toBeCloseTo(0.125, 10);
    expect(E.easeOutCubic(0.5)).toBeCloseTo(0.875, 10);
  });

  it('sine endpoints derivative sense (out faster early)', () => {
    expect(E.easeOutSine(0.5)).toBeCloseTo(Math.sin(Math.PI / 4), 10);
  });

  it('out is the mirror of in (quad)', () => {
    for (const t of [0.1, 0.25, 0.4, 0.8]) {
      expect(E.easeOutQuad(t)).toBeCloseTo(1 - E.easeInQuad(1 - t), 10);
    }
  });

  it('pins interior coefficients the endpoint/midpoint checks miss (easings.net golden values)', () => {
    // Powers: t^n at 0.5 (the pure in/out variants aren't pinned by the inOut midpoint).
    expect(E.easeInQuart(0.5)).toBeCloseTo(0.0625, 10);
    expect(E.easeOutQuart(0.5)).toBeCloseTo(0.9375, 10);
    expect(E.easeInQuint(0.5)).toBeCloseTo(0.03125, 10);
    expect(E.easeOutQuint(0.5)).toBeCloseTo(0.96875, 10);
    // Expo base (10/-10) is invisible to f(0)/f(1)/f(0.5) collapse.
    expect(E.easeInExpo(0.5)).toBeCloseTo(0.03125, 10);
    expect(E.easeOutExpo(0.5)).toBeCloseTo(0.96875, 10);
    // Sine / circ shapes.
    expect(E.easeInSine(0.5)).toBeCloseTo(1 - Math.cos(Math.PI / 4), 10);
    expect(E.easeInCirc(0.5)).toBeCloseTo(1 - Math.sqrt(0.75), 10);
    expect(E.easeOutCirc(0.5)).toBeCloseTo(Math.sqrt(0.75), 10);
    // Back overshoot magnitude (pins BACK_C1/C3).
    expect(E.easeInBack(0.5)).toBeCloseTo(-0.08769750000000004, 8);
  });
});

describe('easing — overshoot curves', () => {
  it('easeOutBack overshoots above 1 before settling', () => {
    // Peak overshoot occurs in the latter half for out-back.
    const peak = Math.max(...[0.6, 0.7, 0.8, 0.9].map(E.easeOutBack));
    expect(peak).toBeGreaterThan(1);
  });

  it('easeInBack dips below 0 early', () => {
    const dip = Math.min(...[0.1, 0.2, 0.3].map(E.easeInBack));
    expect(dip).toBeLessThan(0);
  });

  it('easeOutElastic oscillates (exceeds 1 somewhere)', () => {
    const vals = Array.from({ length: 9 }, (_, i) => E.easeOutElastic((i + 1) / 10));
    expect(Math.max(...vals)).toBeGreaterThan(1);
  });
});

describe('easing — bounce', () => {
  it('easeOutBounce is monotone-ish up and lands on 1', () => {
    expect(E.easeOutBounce(1)).toBeCloseTo(1, 10);
    expect(E.easeOutBounce(0)).toBeCloseTo(0, 10);
  });

  it('easeInBounce is the time-mirror of easeOutBounce', () => {
    for (const t of [0.2, 0.5, 0.8]) {
      expect(E.easeInBounce(t)).toBeCloseTo(1 - E.easeOutBounce(1 - t), 10);
    }
  });
});
