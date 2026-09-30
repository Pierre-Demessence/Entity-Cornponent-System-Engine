import type { Vec2 } from '@pierre/ecs/modules/math';

export const WORLD_W = 800;
export const WORLD_H = 560;

/** A closed circuit: a centerline loop with a constant corridor half-width. */
export interface Track {
  name: string;
  /** Cumulative arc length at each centerline point; `cumulative[i]` is the distance from point 0 to point i. */
  cumulative: number[];
  halfWidth: number;
  /** Total loop length. The finish line sits at arc length 0. */
  length: number;
  /** Ordered loop of centerline points (the last connects back to the first). */
  points: Vec2[];
}

/** Where a point sits relative to the track. */
export interface TrackLocation {
  /** Closest point on the centerline. */
  cx: number;
  cy: number;
  /** Distance from the centerline. */
  dist: number;
  /** Unit vector from the centerline out to the point (zero when exactly on it). */
  nx: number;
  ny: number;
  /** Arc length of the closest centerline point, in `[0, length)`. */
  s: number;
  /** Unit direction of travel along the centerline there. */
  tx: number;
  ty: number;
}

export interface TrackDef {
  name: string;
  halfWidth: number;
  /** Centerline as a function of the loop parameter `theta` in `[0, 2π)`. */
  shape: (theta: number) => Vec2;
}

const SAMPLES = 96;
const CX = WORLD_W / 2;
const CY = WORLD_H / 2;

export const TRACK_DEFS: readonly TrackDef[] = [
  {
    name: 'Oval',
    halfWidth: 56,
    shape: theta => ({ x: CX + 285 * Math.cos(theta), y: CY + 175 * Math.sin(theta) }),
  },
  {
    name: 'Clover',
    halfWidth: 44,
    shape: (theta) => {
      const r = 1 + 0.2 * Math.sin(3 * theta + 0.6);
      return { x: CX + 285 * r * Math.cos(theta), y: CY + 178 * r * Math.sin(theta) };
    },
  },
];

export function makeTrack(def: TrackDef): Track {
  const points: Vec2[] = [];
  for (let i = 0; i < SAMPLES; i++)
    points.push(def.shape((i / SAMPLES) * Math.PI * 2));
  const cumulative: number[] = [0];
  let length = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % SAMPLES]!;
    length += Math.hypot(b.x - a.x, b.y - a.y);
    if (i < SAMPLES - 1)
      cumulative.push(length);
  }
  return { name: def.name, cumulative, halfWidth: def.halfWidth, length, points };
}

export const TRACKS: readonly Track[] = TRACK_DEFS.map(makeTrack);

/** Closest point on the centerline to `(x, y)`, with the arc length and frame there. */
export function locate(track: Track, x: number, y: number): TrackLocation {
  const n = track.points.length;
  let best = Infinity;
  let bestI = 0;
  let bestT = 0;
  for (let i = 0; i < n; i++) {
    const a = track.points[i]!;
    const b = track.points[(i + 1) % n]!;
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lenSq = abx * abx + aby * aby;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * abx + (y - a.y) * aby) / lenSq));
    const d = Math.hypot(x - (a.x + abx * t), y - (a.y + aby * t));
    if (d < best) {
      best = d;
      bestI = i;
      bestT = t;
    }
  }
  const a = track.points[bestI]!;
  const b = track.points[(bestI + 1) % n]!;
  const segLen = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const cx = a.x + (b.x - a.x) * bestT;
  const cy = a.y + (b.y - a.y) * bestT;
  return {
    cx,
    cy,
    dist: best,
    nx: best === 0 ? 0 : (x - cx) / best,
    ny: best === 0 ? 0 : (y - cy) / best,
    s: track.cumulative[bestI]! + bestT * segLen,
    tx: (b.x - a.x) / segLen,
    ty: (b.y - a.y) / segLen,
  };
}

/** Centerline point and travel direction at arc length `s` (wrapped onto the loop). */
export function pointAt(track: Track, s: number): { tx: number; ty: number; x: number; y: number } {
  const n = track.points.length;
  const w = ((s % track.length) + track.length) % track.length;
  let i = 0;
  while (i < n - 1 && track.cumulative[i + 1]! <= w)
    i++;
  const a = track.points[i]!;
  const b = track.points[(i + 1) % n]!;
  const segLen = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const t = (w - track.cumulative[i]!) / segLen;
  return { tx: (b.x - a.x) / segLen, ty: (b.y - a.y) / segLen, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Signed arc-length change from `prev` to `next`, taking the short way round the loop. */
export function arcDelta(track: Track, prev: number, next: number): number {
  let d = next - prev;
  const half = track.length / 2;
  if (d > half)
    d -= track.length;
  else if (d < -half)
    d += track.length;
  return d;
}
