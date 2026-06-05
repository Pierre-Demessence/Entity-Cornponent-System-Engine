import { describe, expect, it } from 'vitest';

import {
  approximately,
  clamp,
  clamp01,
  degToRad,
  inverseLerp,
  lerp,
  lerpAngle,
  pingPong,
  radToDeg,
  remap,
  smoothstep,
  wrap,
} from './math';

describe('clamp', () => {
  it('passes through an in-range value', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps below min and above max', () => {
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });

  it('handles a negative range and a collapsed range', () => {
    expect(clamp(-7, -10, -5)).toBe(-7);
    expect(clamp(99, 3, 3)).toBe(3);
  });
});

describe('clamp01', () => {
  it('bounds to [0, 1]', () => {
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(5)).toBe(1);
  });
});

describe('lerp', () => {
  it('returns the endpoints at t = 0 and t = 1', () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 1)).toBe(20);
  });

  it('interpolates the midpoint and extrapolates unclamped', () => {
    expect(lerp(10, 20, 0.5)).toBe(15);
    expect(lerp(10, 20, 2)).toBe(30);
    expect(lerp(10, 20, -1)).toBe(0);
  });
});

describe('inverseLerp', () => {
  it('inverts lerp', () => {
    expect(inverseLerp(10, 20, 10)).toBe(0);
    expect(inverseLerp(10, 20, 20)).toBe(1);
    expect(inverseLerp(10, 20, 15)).toBe(0.5);
  });

  it('returns 0 for a degenerate range', () => {
    expect(inverseLerp(7, 7, 7)).toBe(0);
  });

  it('round-trips with lerp', () => {
    const t = inverseLerp(3, 9, 6);
    expect(lerp(3, 9, t)).toBe(6);
  });
});

describe('remap', () => {
  it('maps a value across ranges', () => {
    expect(remap(5, 0, 10, 0, 100)).toBe(50);
    expect(remap(0, 0, 10, 20, 40)).toBe(20);
    expect(remap(10, 0, 10, 20, 40)).toBe(40);
  });

  it('supports an inverted output range (ramp down)', () => {
    expect(remap(0, 0, 10, 100, 0)).toBe(100);
    expect(remap(10, 0, 10, 100, 0)).toBe(0);
  });

  it('yields outMin for a degenerate input range', () => {
    expect(remap(5, 3, 3, 20, 40)).toBe(20);
  });
});

describe('smoothstep', () => {
  it('saturates outside the edges and is 0.5 at the midpoint', () => {
    expect(smoothstep(0, 10, -5)).toBe(0);
    expect(smoothstep(0, 10, 15)).toBe(1);
    expect(smoothstep(0, 10, 5)).toBe(0.5);
  });

  it('is smoother than linear near the ends', () => {
    expect(smoothstep(0, 1, 0.25)).toBeCloseTo(0.15625, 5);
  });

  it('steps hard when the edges coincide', () => {
    expect(smoothstep(5, 5, 4)).toBe(0);
    expect(smoothstep(5, 5, 5)).toBe(1);
    expect(smoothstep(5, 5, 6)).toBe(1);
  });
});

describe('wrap', () => {
  it('passes through an in-range value', () => {
    expect(wrap(3, 0, 10)).toBe(3);
  });

  it('wraps above and below the range', () => {
    expect(wrap(12, 0, 10)).toBe(2);
    expect(wrap(-1, 0, 10)).toBe(9);
  });

  it('maps the upper bound back to min', () => {
    expect(wrap(10, 0, 10)).toBe(0);
  });

  it('handles a non-zero min and a degenerate range', () => {
    expect(wrap(5, 2, 4)).toBe(3);
    expect(wrap(99, 5, 5)).toBe(5);
  });
});

describe('pingPong', () => {
  it('bounces 0 -> length -> 0', () => {
    expect(pingPong(0, 10)).toBe(0);
    expect(pingPong(10, 10)).toBe(10);
    expect(pingPong(20, 10)).toBe(0);
    expect(pingPong(15, 10)).toBe(5);
  });

  it('wraps negative and multi-period t', () => {
    expect(pingPong(-5, 10)).toBe(5);
    expect(pingPong(25, 10)).toBe(5);
  });

  it('returns 0 for a non-positive length', () => {
    expect(pingPong(3, 0)).toBe(0);
  });
});

describe('lerpAngle', () => {
  it('returns the endpoints at t = 0 and t = 1', () => {
    expect(lerpAngle(0, 1, 0)).toBeCloseTo(0, 10);
    expect(lerpAngle(0, 1, 1)).toBeCloseTo(1, 10);
  });

  it('takes the short way around the circle', () => {
    // From 0.1 rad to (2π − 0.1) the shortest path is backwards through 0.
    const a = 0.1;
    const b = Math.PI * 2 - 0.1;
    expect(lerpAngle(a, b, 0.5)).toBeCloseTo(0, 10);
  });

  it('resolves an exact half-turn to the -PI direction', () => {
    expect(lerpAngle(0, Math.PI, 0.5)).toBeCloseTo(-Math.PI / 2, 10);
  });
});

describe('angle conversions', () => {
  it('converts degrees and radians', () => {
    expect(degToRad(180)).toBeCloseTo(Math.PI, 10);
    expect(degToRad(90)).toBeCloseTo(Math.PI / 2, 10);
    expect(radToDeg(Math.PI)).toBeCloseTo(180, 10);
  });

  it('round-trips', () => {
    expect(radToDeg(degToRad(57))).toBeCloseTo(57, 10);
  });
});

describe('approximately', () => {
  it('is true within epsilon and false outside it', () => {
    expect(approximately(1, 1)).toBe(true);
    expect(approximately(1, 1 + 1e-9)).toBe(true);
    expect(approximately(1, 1.5)).toBe(false);
  });

  it('honours a custom epsilon', () => {
    expect(approximately(10, 10.4, 0.5)).toBe(true);
    expect(approximately(10, 10.6, 0.5)).toBe(false);
  });

  it('treats the epsilon boundary as within tolerance', () => {
    expect(approximately(1, 1.5, 0.5)).toBe(true);
  });
});
