import { describe, expect, it } from 'vitest';

import {
  aabbVsAabb,
  aabbVsAabbSwept,
  aabbVsCircle,
  circleVsCircle,
} from './narrowphase';

describe('aabbVsAabb', () => {
  it('detects overlap', () => {
    expect(aabbVsAabb(
      { h: 10, w: 10, x: 0, y: 0 },
      { h: 10, w: 10, x: 5, y: 5 },
    )).toBe(true);
  });

  it('rejects disjoint boxes', () => {
    expect(aabbVsAabb(
      { h: 10, w: 10, x: 0, y: 0 },
      { h: 10, w: 10, x: 20, y: 0 },
    )).toBe(false);
  });

  it('rejects edge contact (strict overlap)', () => {
    expect(aabbVsAabb(
      { h: 10, w: 10, x: 0, y: 0 },
      { h: 10, w: 10, x: 10, y: 0 },
    )).toBe(false);
  });

  it('detects containment', () => {
    expect(aabbVsAabb(
      { h: 100, w: 100, x: 0, y: 0 },
      { h: 5, w: 5, x: 10, y: 10 },
    )).toBe(true);
  });
});

describe('circleVsCircle', () => {
  it('detects overlap', () => {
    expect(circleVsCircle({ x: 0, y: 0 }, 5, { x: 3, y: 0 }, 5)).toBe(true);
  });

  it('accepts touch (inclusive)', () => {
    expect(circleVsCircle({ x: 0, y: 0 }, 5, { x: 10, y: 0 }, 5)).toBe(true);
  });

  it('rejects separation', () => {
    expect(circleVsCircle({ x: 0, y: 0 }, 5, { x: 11, y: 0 }, 5)).toBe(false);
  });
});

describe('aabbVsCircle', () => {
  it('detects overlap when centre is inside the AABB', () => {
    expect(aabbVsCircle(
      { h: 10, w: 10, x: 0, y: 0 },
      { x: 5, y: 5 },
      1,
    )).toBe(true);
  });

  it('detects overlap via corner proximity', () => {
    expect(aabbVsCircle(
      { h: 10, w: 10, x: 0, y: 0 },
      { x: 11, y: 11 },
      2,
    )).toBe(true);
  });

  it('rejects far centre', () => {
    expect(aabbVsCircle(
      { h: 10, w: 10, x: 0, y: 0 },
      { x: 20, y: 20 },
      2,
    )).toBe(false);
  });
});

describe('aabbVsAabbSwept', () => {
  it('reports no hit when already disjoint and motion misses', () => {
    const hit = aabbVsAabbSwept(
      { h: 10, w: 10, x: 0, y: 0 },
      { x: 5, y: 0 },
      { h: 10, w: 10, x: 100, y: 100 },
    );
    expect(hit.hit).toBe(false);
    expect(hit.tEntry).toBe(1);
  });

  it('detects a rightward collision and reports tEntry + left-facing normal', () => {
    // A at (0,0,10x10) moves right by 20; B starts at (15,0,10x10).
    // Entry time on X: (15 - 10) / 20 = 0.25.
    const hit = aabbVsAabbSwept(
      { h: 10, w: 10, x: 0, y: 0 },
      { x: 20, y: 0 },
      { h: 10, w: 10, x: 15, y: 0 },
    );
    expect(hit.hit).toBe(true);
    expect(hit.tEntry).toBeCloseTo(0.25, 5);
    expect(hit.normal).toEqual({ x: -1, y: 0 });
  });

  it('detects a downward collision with top-facing normal', () => {
    const hit = aabbVsAabbSwept(
      { h: 10, w: 10, x: 0, y: 0 },
      { x: 0, y: 20 },
      { h: 10, w: 10, x: 0, y: 15 },
    );
    expect(hit.hit).toBe(true);
    expect(hit.tEntry).toBeCloseTo(0.25, 5);
    expect(hit.normal).toEqual({ x: 0, y: -1 });
  });

  it('accepts zero motion when projections already overlap on one axis', () => {
    // No Y motion; X motion slides in from the right.
    const hit = aabbVsAabbSwept(
      { h: 10, w: 10, x: 0, y: 5 },
      { x: 20, y: 0 },
      { h: 20, w: 10, x: 15, y: 0 },
    );
    expect(hit.hit).toBe(true);
  });

  it('reports no hit when a zero-motion axis has no overlap', () => {
    const hit = aabbVsAabbSwept(
      { h: 10, w: 10, x: 0, y: 0 },
      { x: 20, y: 0 },
      { h: 10, w: 10, x: 15, y: 100 },
    );
    expect(hit.hit).toBe(false);
  });

  it('reports no hit when entry time is past 1', () => {
    // B far enough right that even full motion does not reach it.
    const hit = aabbVsAabbSwept(
      { h: 10, w: 10, x: 0, y: 0 },
      { x: 5, y: 0 },
      { h: 10, w: 10, x: 50, y: 0 },
    );
    expect(hit.hit).toBe(false);
  });
  it('reports right-facing normal on leftward motion', () => {
    const hit = aabbVsAabbSwept(
      { h: 10, w: 10, x: 20, y: 0 },
      { x: -20, y: 0 },
      { h: 10, w: 10, x: 5, y: 0 },
    );
    expect(hit.hit).toBe(true);
    expect(hit.normal).toEqual({ x: 1, y: 0 });
  });

  it('reports bottom-facing normal on upward motion', () => {
    const hit = aabbVsAabbSwept(
      { h: 10, w: 10, x: 0, y: 20 },
      { x: 0, y: -20 },
      { h: 10, w: 10, x: 0, y: 5 },
    );
    expect(hit.hit).toBe(true);
    expect(hit.normal).toEqual({ x: 0, y: 1 });
  });

  it('returns NO_HIT when already penetrating (documented behaviour)', () => {
    const hit = aabbVsAabbSwept(
      { h: 10, w: 10, x: 5, y: 5 },
      { x: 1, y: 0 },
      { h: 10, w: 10, x: 10, y: 5 },
    );
    expect(hit.hit).toBe(false);
  });

  it('returns NO_HIT when both motion axes are zero', () => {
    const hit = aabbVsAabbSwept(
      { h: 10, w: 10, x: 0, y: 0 },
      { x: 0, y: 0 },
      { h: 10, w: 10, x: 20, y: 20 },
    );
    expect(hit.hit).toBe(false);
  });

  it('picks y-axis normal on simultaneous corner entry (tie-break)', () => {
    // Symmetric diagonal motion into a corner — x.entry === y.entry.
    const hit = aabbVsAabbSwept(
      { h: 10, w: 10, x: 0, y: 0 },
      { x: 20, y: 20 },
      { h: 10, w: 10, x: 15, y: 15 },
    );
    expect(hit.hit).toBe(true);
    expect(hit.normal).toEqual({ x: 0, y: -1 });
  });

  it('nO_HIT sentinel is frozen (cannot be mutated by callers)', () => {
    const hit = aabbVsAabbSwept(
      { h: 10, w: 10, x: 0, y: 0 },
      { x: 0, y: 0 },
      { h: 10, w: 10, x: 100, y: 100 },
    );
    expect(() => {
      (hit as { hit: boolean }).hit = true;
    }).toThrow();
  });
});
