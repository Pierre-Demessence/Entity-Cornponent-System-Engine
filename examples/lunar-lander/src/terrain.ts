import { clamp, remap, smoothstep } from '@pierre/ecs/modules/math';
import { fbm1D, perlin1D, valueNoise1D } from '@pierre/ecs/modules/noise';
import { makeSeededRng } from '@pierre/ecs/modules/rng';

export const WORLD_W = 4000;
export const WORLD_H = 1400;
/** Horizontal spacing of the height samples, in world units. */
export const STEP = 8;

const BASE_Y = 1000;
const MIN_Y = 700;
const MAX_Y = 1300;
/** Width of the smooth shoulder blending the noise into a pad. */
const SHOULDER = 70;

export interface Pad {
  /** Score multiplier: narrower pads pay more. */
  readonly multiplier: number;
  /** Full width. */
  readonly width: number;
  /** Centre x. */
  readonly x: number;
  /** Surface y the terrain is flattened to. */
  readonly y: number;
}

export interface Terrain {
  readonly heights: Float32Array;
  readonly pads: readonly Pad[];
  readonly seed: number;
}

const PAD_SPECS = [
  { multiplier: 2, width: 150 },
  { multiplier: 3, width: 110 },
  { multiplier: 4, width: 84 },
  { multiplier: 5, width: 64 },
] as const;

/** The raw noise profile before pads are carved: rolling fbm plus ridges and grit. */
function profile(x: number, seed: number): number {
  const rolling = fbm1D(x * 0.0018, { gain: 0.55, octaves: 4, seed });
  const ridges = perlin1D(x * 0.011, seed + 101) * 0.35;
  const grit = valueNoise1D(x * 0.06, seed + 202) * 0.06;
  return BASE_Y + (rolling + ridges + grit) * 260;
}

/** Build a terrain for `seed`: one pad per spec, in shuffled order along the map. */
export function generateTerrain(seed: number): Terrain {
  const rng = makeSeededRng(seed);
  const count = Math.floor(WORLD_W / STEP) + 1;
  const heights = new Float32Array(count);
  for (let i = 0; i < count; i++)
    heights[i] = clamp(profile(i * STEP, seed), MIN_Y, MAX_Y);

  const specs = [...PAD_SPECS];
  // Fisher-Yates over the specs so the multiplier order differs per seed.
  for (let i = specs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [specs[i], specs[j]] = [specs[j]!, specs[i]!];
  }

  const slot = WORLD_W / specs.length;
  const pads: Pad[] = specs.map((spec, i) => {
    const margin = spec.width / 2 + SHOULDER + 40;
    const x = clamp(slot * i + remap(rng(), 0, 1, margin, slot - margin), margin, WORLD_W - margin);
    const y = clamp(profile(x, seed), MIN_Y + 40, MAX_Y - 40);
    return { multiplier: spec.multiplier, width: spec.width, x, y };
  });

  for (const pad of pads) {
    for (let i = 0; i < count; i++) {
      // One extra step keeps every sample the pad's edge interpolates between flat.
      const dx = Math.abs(i * STEP - pad.x) - (pad.width / 2 + STEP);
      if (dx >= SHOULDER)
        continue;
      // 0 on the pad, 1 at the outer edge of the shoulder.
      const t = smoothstep(0, SHOULDER, dx);
      heights[i] = pad.y + (heights[i]! - pad.y) * t;
    }
  }
  return { heights, pads, seed };
}

/** Terrain surface y at world `x` (linear between samples, clamped to the map). */
export function heightAt(terrain: Terrain, x: number): number {
  const f = clamp(x / STEP, 0, terrain.heights.length - 1);
  const i = Math.min(Math.floor(f), terrain.heights.length - 2);
  const t = f - i;
  return terrain.heights[i]! * (1 - t) + terrain.heights[i + 1]! * t;
}

/** The pad whose flat top spans `x`, if any. */
export function padAt(terrain: Terrain, x: number): Pad | undefined {
  return terrain.pads.find(p => Math.abs(x - p.x) <= p.width / 2);
}
