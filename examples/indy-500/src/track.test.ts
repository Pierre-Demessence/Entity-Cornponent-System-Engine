import { describe, expect, it } from 'vitest';

import { arcDelta, locate, pointAt, TRACKS } from './track';

describe.each(TRACKS.map(t => [t.name, t] as const))('track %s', (_name, track) => {
  it('is a closed loop with cumulative lengths that increase', () => {
    expect(track.length).toBeGreaterThan(500);
    for (let i = 1; i < track.cumulative.length; i++)
      expect(track.cumulative[i]).toBeGreaterThan(track.cumulative[i - 1]!);
  });

  it('round-trips arc length through pointAt and locate', () => {
    for (const s of [0, 100, track.length / 2, track.length - 5]) {
      const p = pointAt(track, s);
      const loc = locate(track, p.x, p.y);
      expect(loc.dist).toBeLessThan(0.01);
      expect(Math.abs(arcDelta(track, s, loc.s))).toBeLessThan(0.5);
    }
  });

  it('wraps arc length past the finish line', () => {
    const a = pointAt(track, 10);
    const b = pointAt(track, 10 + track.length);
    expect(a.x).toBeCloseTo(b.x);
    expect(a.y).toBeCloseTo(b.y);
  });

  it('fits on screen with the corridor edges', () => {
    for (const p of track.points) {
      expect(p.x - track.halfWidth).toBeGreaterThan(0);
      expect(p.x + track.halfWidth).toBeLessThan(800);
      expect(p.y - track.halfWidth).toBeGreaterThan(0);
      expect(p.y + track.halfWidth).toBeLessThan(560);
    }
  });

  it('reports the offset side through the normal', () => {
    const p = pointAt(track, 200);
    const loc = locate(track, p.x - p.ty * 10, p.y + p.tx * 10);
    expect(loc.dist).toBeCloseTo(10, 0);
    expect(loc.nx * -p.ty + loc.ny * p.tx).toBeGreaterThan(0.9);
  });
});

describe('arcDelta', () => {
  it('takes the short way across the finish line', () => {
    const track = TRACKS[0]!;
    expect(arcDelta(track, track.length - 5, 5)).toBeCloseTo(10);
    expect(arcDelta(track, 5, track.length - 5)).toBeCloseTo(-10);
  });
});
