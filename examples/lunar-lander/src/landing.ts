import type { Pad, Terrain } from './terrain';

import { approximately, clamp01, remap, smoothstep } from '@pierre/ecs/modules/math';

import { padAt } from './terrain';

export const MAX_LAND_VY = 28;
export const MAX_LAND_VX = 16;
export const MAX_LAND_ANGLE = 0.22;
export const FUEL_MAX = 100;
/** Horizontal distance from the hull centre to each foot. */
export const LEG_SPREAD = 14;

export interface Touchdown {
  angle: number;
  fuel: number;
  vx: number;
  vy: number;
  /** Hull centre x. */
  x: number;
}

export type Verdict
  = | { readonly kind: 'crash'; readonly reason: 'angle' | 'pad' | 'speed' }
    | { readonly kind: 'landed'; readonly pad: Pad; readonly score: number };

/**
 * Judge a touchdown. Both feet must be on the same pad, the hull upright and
 * slow. The score is the pad multiplier times a base that rewards a gentle
 * touch and leftover fuel.
 */
export function judgeTouchdown(terrain: Terrain, t: Touchdown): Verdict {
  const left = padAt(terrain, t.x - LEG_SPREAD);
  const right = padAt(terrain, t.x + LEG_SPREAD);
  if (!left || left !== right)
    return { kind: 'crash', reason: 'pad' };
  if (Math.abs(t.angle) > MAX_LAND_ANGLE)
    return { kind: 'crash', reason: 'angle' };
  if (t.vy > MAX_LAND_VY || Math.abs(t.vx) > MAX_LAND_VX)
    return { kind: 'crash', reason: 'speed' };
  return { kind: 'landed', pad: left, score: landingScore(left, t) };
}

export function landingScore(pad: Pad, t: Touchdown): number {
  const gentle = 1 - smoothstep(4, MAX_LAND_VY, Math.hypot(t.vx, t.vy));
  const fuel = clamp01(remap(t.fuel, 0, FUEL_MAX, 0, 1));
  const upright = approximately(t.angle, 0, 0.02) ? 20 : 0;
  return Math.round((100 * gentle + 100 * fuel + upright) * pad.multiplier);
}
