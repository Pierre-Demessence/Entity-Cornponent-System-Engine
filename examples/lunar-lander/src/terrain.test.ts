import { describe, expect, it } from 'vitest';

import { FUEL_MAX, judgeTouchdown, MAX_LAND_ANGLE } from './landing';
import { generateTerrain, heightAt, padAt, STEP, WORLD_W } from './terrain';

describe('terrain', () => {
  it('is deterministic per seed and differs across seeds', () => {
    expect(generateTerrain(3).heights).toEqual(generateTerrain(3).heights);
    expect(generateTerrain(3).heights).not.toEqual(generateTerrain(4).heights);
  });

  it('carves one flat pad per multiplier, each fully flat', () => {
    const t = generateTerrain(7);
    expect(t.pads.map(p => p.multiplier).sort()).toEqual([2, 3, 4, 5]);
    for (const pad of t.pads) {
      for (let x = pad.x - pad.width / 2; x <= pad.x + pad.width / 2; x += STEP / 2)
        expect(heightAt(t, x)).toBeCloseTo(pad.y, 3);
    }
  });

  it('keeps pads apart and inside the map', () => {
    const t = generateTerrain(11);
    const xs = t.pads.map(p => p.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++)
      expect(xs[i]! - xs[i - 1]!).toBeGreaterThan(150);
    for (const p of t.pads) {
      expect(p.x - p.width / 2).toBeGreaterThan(0);
      expect(p.x + p.width / 2).toBeLessThan(WORLD_W);
    }
  });

  it('interpolates height and clamps outside the map', () => {
    const t = generateTerrain(1);
    expect(heightAt(t, -50)).toBe(t.heights[0]);
    expect(heightAt(t, WORLD_W + 50)).toBe(t.heights[t.heights.length - 1]);
    const mid = heightAt(t, STEP / 2);
    expect(mid).toBeCloseTo((t.heights[0]! + t.heights[1]!) / 2, 4);
  });
});

describe('judgeTouchdown', () => {
  const terrain = generateTerrain(5);
  const pad = terrain.pads[0]!;
  const good = { angle: 0, fuel: FUEL_MAX, vx: 0, vy: 5, x: pad.x };

  it('lands gently on a pad and scores by multiplier', () => {
    const v = judgeTouchdown(terrain, good);
    expect(v.kind).toBe('landed');
    if (v.kind === 'landed') {
      expect(v.pad).toBe(pad);
      expect(v.score).toBeGreaterThan(0);
    }
  });

  it('pays more on a higher multiplier for the same touchdown', () => {
    const score = (p: (typeof terrain.pads)[number]): number => {
      const v = judgeTouchdown(terrain, { ...good, x: p.x });
      return v.kind === 'landed' ? v.score / p.multiplier : Number.NaN;
    };
    const per = terrain.pads.map(score);
    for (const s of per)
      expect(Math.abs(s - per[0]!)).toBeLessThan(1); // integer rounding of the score
  });

  it('crashes when too fast, too tilted, or off a pad', () => {
    expect(judgeTouchdown(terrain, { ...good, vy: 60 })).toEqual({ kind: 'crash', reason: 'speed' });
    expect(judgeTouchdown(terrain, { ...good, vx: 40 })).toEqual({ kind: 'crash', reason: 'speed' });
    expect(judgeTouchdown(terrain, { ...good, angle: MAX_LAND_ANGLE + 0.1 })).toEqual({ kind: 'crash', reason: 'angle' });
    expect(judgeTouchdown(terrain, { ...good, x: pad.x + pad.width })).toEqual({ kind: 'crash', reason: 'pad' });
  });

  it('crashes when one foot hangs over the pad edge', () => {
    const edge = pad.x + pad.width / 2;
    expect(judgeTouchdown(terrain, { ...good, x: edge }).kind).toBe('crash');
    expect(padAt(terrain, edge + 1)).toBeUndefined();
  });

  it('scores more with fuel left and a gentler touch', () => {
    const score = (over: Partial<typeof good>): number => {
      const v = judgeTouchdown(terrain, { ...good, ...over });
      return v.kind === 'landed' ? v.score : 0;
    };
    expect(score({ fuel: 80 })).toBeGreaterThan(score({ fuel: 10 }));
    expect(score({ vy: 3 })).toBeGreaterThan(score({ vy: 25 }));
  });
});
