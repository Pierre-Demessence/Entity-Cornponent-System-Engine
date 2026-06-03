import { TMX_FLIP_D, TMX_FLIP_H, TMX_FLIP_V } from '@pierre/ecs/modules/tmx';

/**
 * A tile's flip flags resolved to the canvas transform the renderer applies
 * about an entity's position: `translate(x, y) → rotate(angle) → scale(sx, sy)`.
 * Tiles must therefore be positioned at their centre with `anchor: 'center'`
 * so the flip/rotation pivots in place.
 */
export interface TileTransform {
  angle: number;
  sx: number;
  sy: number;
}

const Q = Math.PI / 2;

// The 8 orientations of a square (dihedral group D4), indexed by the
// TMX_FLIP_H | TMX_FLIP_V | TMX_FLIP_D bitfield. Each entry is the
// rotate-then-scale decomposition of Tiled's "diagonal, then vertical, then
// horizontal" reflection sequence, expressed about the tile centre.
const TABLE: readonly TileTransform[] = [
  { angle: 0, sx: 1, sy: 1 }, // 0: identity
  { angle: 0, sx: -1, sy: 1 }, // H
  { angle: 0, sx: 1, sy: -1 }, // V
  { angle: Math.PI, sx: 1, sy: 1 }, // H+V
  { angle: Q, sx: 1, sy: -1 }, // D
  { angle: Q, sx: 1, sy: 1 }, // H+D
  { angle: -Q, sx: 1, sy: 1 }, // V+D
  { angle: -Q, sx: 1, sy: -1 }, // H+V+D
];

const FLAG_MASK = TMX_FLIP_H | TMX_FLIP_V | TMX_FLIP_D;

/** Resolves a per-tile flip-flag bitfield to its render transform. */
export function tileTransform(flag: number): TileTransform {
  return TABLE[flag & FLAG_MASK]!;
}
