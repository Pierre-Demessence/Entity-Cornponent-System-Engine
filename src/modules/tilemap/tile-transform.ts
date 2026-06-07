import { TMX_FLIP_D, TMX_FLIP_H, TMX_FLIP_V } from '@pierre/ecs/modules/tmx';

/**
 * A tile's flip flags resolved to the canvas transform the renderer applies
 * about a centre-anchored sprite: `translate(x, y) → rotate(angle) →
 * scale(sx, sy)`. Centre-anchoring is required so the pivot is in the
 * middle of the tile.
 *
 * Only the full 8-orientation D4 dihedral group needs this helper. For the
 * common H/V-only case, {@link spawnTilemap} sets `flipH` / `flipV` directly
 * on the `RenderableDef` and no extra transform components are needed.
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

/**
 * Resolves a per-tile flip-flag bitfield (`TmxLayer.flags[i]`) to the
 * canvas render transform that reproduces Tiled's flip/rotate behaviour
 * for a centre-anchored sprite.
 *
 * Callers register `RotationDef` and `ScaleDef` stores and apply the
 * result in {@link SpawnTilemapOptions.onTile}.
 */
export function tileTransform(flag: number): TileTransform {
  return TABLE[flag & FLAG_MASK]!;
}
