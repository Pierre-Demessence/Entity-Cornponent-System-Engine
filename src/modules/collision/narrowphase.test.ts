import { describe, expect, it } from 'vitest';

import {
  aabbVsAabb,
  aabbVsAabbSwept,
  aabbVsCircle,
  bounceOffAabb,
  circleVsCircle,
  rayVsAabb,
  reflect,
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

describe('reflect', () => {
  it('reflects off a right-facing wall (normal {1,0})', () => {
    expect(reflect({ x: -5, y: 3 }, { x: 1, y: 0 })).toEqual({ x: 5, y: 3 });
  });

  it('reflects off a left-facing wall (normal {-1,0})', () => {
    expect(reflect({ x: 5, y: 3 }, { x: -1, y: 0 })).toEqual({ x: -5, y: 3 });
  });

  it('reflects off a ceiling (normal {0,-1})', () => {
    expect(reflect({ x: 3, y: 5 }, { x: 0, y: -1 })).toEqual({ x: 3, y: -5 });
  });

  it('reflects off a floor (normal {0,1})', () => {
    expect(reflect({ x: 3, y: -5 }, { x: 0, y: 1 })).toEqual({ x: 3, y: 5 });
  });

  it('reflects diagonally off a 45° normal', () => {
    const invSqrt2 = 1 / Math.sqrt(2);
    const v = reflect({ x: 1, y: 1 }, { x: invSqrt2, y: invSqrt2 });
    // Approaching the surface diagonally — both components reverse.
    expect(v.x).toBeCloseTo(-1, 10);
    expect(v.y).toBeCloseTo(-1, 10);
  });

  it('preserves the tangent component', () => {
    // Moving purely tangent to the surface — no change.
    expect(reflect({ x: 5, y: 0 }, { x: 0, y: 1 })).toEqual({ x: 5, y: 0 });
  });
});

describe('bounceOffAabb', () => {
  const mover: { h: number; w: number; x: number; y: number } = { h: 10, w: 10, x: 0, y: 0 };
  const obstacle: { h: number; w: number; x: number; y: number } = { h: 10, w: 10, x: 8, y: 0 };

  it('returns null when boxes are not overlapping', () => {
    expect(bounceOffAabb(
      { h: 10, w: 10, x: 0, y: 0 },
      { x: 0, y: 0 },
      { h: 10, w: 10, x: 20, y: 0 },
    )).toBeNull();
  });

  it('returns null on edge contact (strict overlap required)', () => {
    expect(bounceOffAabb(
      { h: 10, w: 10, x: 0, y: 0 },
      { x: 0, y: 0 },
      { h: 10, w: 10, x: 10, y: 0 },
    )).toBeNull();
  });

  it('pushes out on the minimum-overlap axis (X in this case)', () => {
    const r = bounceOffAabb(mover, { x: -5, y: 0 }, obstacle)!;
    expect(r).not.toBeNull();
    // Overlap on X = 2, on Y = 10.  X wins → push left (negative).
    expect(r.pushOut.x).toBe(-2);
    expect(r.pushOut.y).toBe(0);
  });

  it('reflects velocity on the separation axis', () => {
    const r = bounceOffAabb(mover, { x: -5, y: 2 }, obstacle)!;
    // Mover was heading left; after bounce off left side of obstacle it heads right.
    expect(r.velocity.x).toBe(5);
    // Y component untouched.
    expect(r.velocity.y).toBe(2);
  });

  it('pushes out on Y when vertical overlap is smaller', () => {
    const r = bounceOffAabb(
      { h: 10, w: 10, x: 0, y: 0 },
      { x: 0, y: -3 },
      { h: 10, w: 10, x: 2, y: 8 },
    )!;
    expect(r).not.toBeNull();
    expect(r.pushOut.x).toBe(0);
    // Overlap on Y = 2, on X = 8.  Y wins → push up (negative).
    expect(r.pushOut.y).toBe(-2);
    expect(r.velocity.y).toBe(3);
  });

  it('reflects moving-right ball off the right side of an obstacle', () => {
    // Mover approaches from the left, heading right.
    const r = bounceOffAabb(
      { h: 10, w: 10, x: 0, y: 0 },
      { x: 5, y: 0 },
      { h: 10, w: 10, x: 8, y: 0 },
    )!;
    expect(r).not.toBeNull();
    expect(r.velocity.x).toBe(-5);
  });

  it('tie-breaks to Y axis when overlaps are equal', () => {
    const r = bounceOffAabb(
      { h: 10, w: 10, x: 0, y: 0 },
      { x: -5, y: -5 },
      { h: 10, w: 10, x: 5, y: 5 },
    )!;
    expect(r).not.toBeNull();
    // X overlap = 5, Y overlap = 5 → Y wins.
    expect(r.pushOut.x).toBe(0);
    expect(r.pushOut.y).not.toBe(0);
    expect(r.velocity.x).toBe(-5);
    expect(r.velocity.y).toBe(5);
  });
});

const BOX = { h: 10, w: 10, x: 10, y: 10 };

describe('rayVsAabb', () => {
  it('enters through the X face when approaching from the left', () => {
    expect(rayVsAabb({ x: 0, y: 15 }, { x: 1, y: 0 }, BOX)).toEqual({ axis: 'x', t: 10 });
  });

  it('enters through the Y face when approaching from above', () => {
    expect(rayVsAabb({ x: 15, y: 0 }, { x: 0, y: 1 }, BOX)).toEqual({ axis: 'y', t: 10 });
  });

  it('enters through the Y face travelling upward, with a negative direction', () => {
    // Bottom face is `box.y + box.h = 20`, so the entry is 10 units away.
    expect(rayVsAabb({ x: 15, y: 30 }, { x: 0, y: -1 }, BOX)).toEqual({ axis: 'y', t: 10 });

    // Diagonal and negative: the Y slab's near/far planes arrive swapped, and
    // the X face is the later entry.
    expect(rayVsAabb({ x: 0, y: 25 }, { x: 1, y: -1 }, BOX)).toEqual({ axis: 'x', t: 10 });
  });

  it('enters through the X face approaching from the right, with a negative direction', () => {
    // The right face is `box.x + box.w = 20`, so the entry is 10 units away.
    expect(rayVsAabb({ x: 30, y: 15 }, { x: -1, y: 0 }, BOX)).toEqual({ axis: 'x', t: 10 });
  });

  it('enters through the later axis for a diagonal ray', () => {
    // X enters at t=15 (the x=10 face); the Y slab is entered long before and
    // left after, so it cannot constrain the entry.
    expect(rayVsAabb({ x: -5, y: 15 }, { x: 1, y: 0.1 }, BOX)).toEqual({ axis: 'x', t: 15 });

    // Steeper ray from the left of the box: X enters at t=5 but leaves at
    // t=15, while Y only enters at t=10 → the Y face is the entry.
    expect(rayVsAabb({ x: 5, y: 0 }, { x: 1, y: 1 }, BOX)).toEqual({ axis: 'y', t: 10 });
  });

  it('misses when the ray passes beside the box', () => {
    expect(rayVsAabb({ x: 0, y: 0 }, { x: 1, y: 0 }, BOX)).toBeNull();
  });

  it('misses when the box is entirely behind the origin', () => {
    expect(rayVsAabb({ x: 50, y: 15 }, { x: 1, y: 0 }, BOX)).toBeNull();
  });

  it('misses when the origin is inside the box', () => {
    expect(rayVsAabb({ x: 15, y: 15 }, { x: 1, y: 0 }, BOX)).toBeNull();
  });

  it('misses when the origin sits on a face, either direction', () => {
    // On the near face heading in: entry would be 0, which is not an entry.
    expect(rayVsAabb({ x: 10, y: 15 }, { x: 1, y: 0 }, BOX)).toBeNull();
    // On the far face heading in.
    expect(rayVsAabb({ x: 20, y: 15 }, { x: -1, y: 0 }, BOX)).toBeNull();
    // On the top face and travelling along it: the boundary rule wins over the
    // "a ray along a face counts" rule, because there is no entry at all.
    expect(rayVsAabb({ x: 15, y: 10 }, { x: 1, y: 0 }, BOX)).toBeNull();
  });

  it('misses for a zero-length direction, from outside and from inside', () => {
    // Outside, the parallel pre-filter rejects it...
    expect(rayVsAabb({ x: 0, y: 15 }, { x: 0, y: 0 }, BOX)).toBeNull();
    // ...inside, it is the "no entry time was ever set" path that rejects it.
    expect(rayVsAabb({ x: 15, y: 15 }, { x: 0, y: 0 }, BOX)).toBeNull();
  });

  it('treats a ray running along a face as a hit', () => {
    // Running exactly along the top edge: boxes stay closed. The entry axis is
    // the left face it reaches, not the edge it grazes.
    expect(rayVsAabb({ x: 0, y: 10 }, { x: 1, y: 0 }, BOX)).toEqual({ axis: 'x', t: 10 });
  });

  it('counts a corner graze as a hit', () => {
    // Touches the box at exactly (10, 20), so entry and exit times are equal —
    // which the closed-box convention keeps as a hit rather than a miss.
    expect(rayVsAabb({ x: 0, y: 10 }, { x: 1, y: 1 }, BOX)).toEqual({ axis: 'x', t: 10 });
  });

  it('tie-breaks to the Y face when entry times are equal', () => {
    // Straight at the box's top-left corner: both axes enter at t=20.
    const hit = rayVsAabb({ x: -10, y: -10 }, { x: 1, y: 1 }, BOX)!;
    expect(hit.t).toBe(20);
    expect(hit.axis).toBe('y');
  });

  it('reports t in units of dir, so a segment vector makes it a fraction', () => {
    // Segment from (0,15) to (25,15): the box is crossed at 40% of the way.
    expect(rayVsAabb({ x: 0, y: 15 }, { x: 25, y: 0 }, BOX)).toEqual({ axis: 'x', t: 0.4 });

    // A segment that stops short reports t > 1, which the caller rejects.
    const short = rayVsAabb({ x: 0, y: 15 }, { x: 5, y: 0 }, BOX)!;
    expect(short.t).toBeGreaterThan(1);
  });

  it('is unaffected by the magnitude of a unit-consistent direction', () => {
    const unit = rayVsAabb({ x: 0, y: 15 }, { x: 1, y: 0 }, BOX)!;
    const scaled = rayVsAabb({ x: 0, y: 15 }, { x: 2, y: 0 }, BOX)!;
    expect(scaled.t).toBe(unit.t / 2);
    expect(scaled.axis).toBe(unit.axis);
  });
});
