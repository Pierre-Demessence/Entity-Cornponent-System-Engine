import { TMX_FLIP_D, TMX_FLIP_H, TMX_FLIP_V } from '@pierre/ecs/modules/tmx';
import { describe, expect, it } from 'vitest';

import { tileTransform } from './tile-transform';

const Q = Math.PI / 2;

describe('tileTransform', () => {
  it('returns identity for flag 0', () => {
    expect(tileTransform(0)).toEqual({ angle: 0, sx: 1, sy: 1 });
  });

  it('resolves H (horizontal flip)', () => {
    expect(tileTransform(TMX_FLIP_H)).toEqual({ angle: 0, sx: -1, sy: 1 });
  });

  it('resolves V (vertical flip)', () => {
    expect(tileTransform(TMX_FLIP_V)).toEqual({ angle: 0, sx: 1, sy: -1 });
  });

  it('resolves H+V (180° rotation)', () => {
    expect(tileTransform(TMX_FLIP_H | TMX_FLIP_V)).toEqual({ angle: Math.PI, sx: 1, sy: 1 });
  });

  it('resolves D (diagonal transpose)', () => {
    expect(tileTransform(TMX_FLIP_D)).toEqual({ angle: Q, sx: 1, sy: -1 });
  });

  it('resolves H+D', () => {
    expect(tileTransform(TMX_FLIP_H | TMX_FLIP_D)).toEqual({ angle: Q, sx: 1, sy: 1 });
  });

  it('resolves V+D', () => {
    expect(tileTransform(TMX_FLIP_V | TMX_FLIP_D)).toEqual({ angle: -Q, sx: 1, sy: 1 });
  });

  it('resolves H+V+D', () => {
    expect(tileTransform(TMX_FLIP_H | TMX_FLIP_V | TMX_FLIP_D)).toEqual({ angle: -Q, sx: 1, sy: -1 });
  });

  it('ignores bits outside the flip mask', () => {
    // Extra bits should be masked off — same result as the base flag combo
    expect(tileTransform(TMX_FLIP_H | 0xF0)).toEqual(tileTransform(TMX_FLIP_H));
  });
});
