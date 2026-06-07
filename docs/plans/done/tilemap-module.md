# Plan: `modules/tilemap` — tile-layer spawn + collision-grid helpers

**Status:** complete — 2026-06-07

## Bug fixed during implementation

**Double-flip in centre-anchored spawn.** The initial `spawnTilemap`
applied `flipH`/`flipV` for H/V flags regardless of anchor. The rpg
example's `onTile` callback also applied the same H/V transforms via
`tileTransform` → `RotationDef`/`ScaleDef`. The renderer applied both —
canvas `scale(-1,1)` from `flipH` AND `scale(-1,1)` from `ScaleDef`,
cancelling each other. Fix: when `anchor: 'center'`, `spawnTilemap`
does not set `flipH`/`flipV` — centre-anchored tiles use D4 transforms
exclusively via `onTile`.

## Problem

Two authored-tile-grid consumers (`examples/tilemap`, `examples/rpg`)
hand-roll the same ~150-line pipeline:

1. Build an atlas from all unique GIDs across all TMX layers
2. Spawn one sprite entity per non-empty tile (nested layer→cell loop,
   position calc, `RenderableDef` + `RenderOrderDef` + flip transforms)
3. Derive a `CollisionGrid` (Uint8Array walkability mask) from layered
   GIDs with two allowlists (floor GIDs, walkable-prop GIDs)

The TMX parser (`modules/tmx`) already ships the parse half. What's
missing is the **spawn** and **collision-derivation** half — exactly the
boilerplate both consumers share.

## Design

### No new primitives

Tiles are sprite entities with standard components (`PositionDef`,
`RenderableDef` sprite variant, `RenderOrderDef`, `RotationDef`,
`ScaleDef`). The module does not introduce a new `Renderable` kind or a
new collision shape — it **eliminates boilerplate**, not concepts.

### Exports

```typescript
// ── Atlas ──────────────────────────────────────────────

export interface BuildTilemapAtlasOptions {
  map: TmxMap;
  image: CanvasImageSource;
  /** Atlas registry name — sprites will set `atlas: name`. */
  name: string;
}

/** Collects all unique GIDs from every layer, resolves each to a
 * frame via `gidToFrame`, and returns a `TextureAtlasRegistry` ready
 * for `Canvas2DRenderContext.atlases`. */
export async function buildTilemapAtlas(
  opts: BuildTilemapAtlasOptions,
): Promise<TextureAtlasRegistry>;

// ── Spawn ──────────────────────────────────────────────

export interface SpawnTilemapOptions {
  world: EcsWorld;
  map: TmxMap;
  /** Atlas registry key set on each spawned sprite. */
  atlas: string;
  /** If true (default), resolves per-tile flip flags into
   * RotationDef / ScaleDef on the spawned entity. */
  resolveTransforms?: boolean;
}

/** Spawns one entity per non-empty tile across all visible layers.
 * Each entity receives PositionDef, RenderableDef (sprite),
 * RenderOrderDef (layer index), and optionally RotationDef +
 * ScaleDef from flip flags. Returns the count of spawned entities. */
export function spawnTilemap(opts: SpawnTilemapOptions): number;

// ── Collision ──────────────────────────────────────────

export interface BuildCollisionGridOptions {
  /** GIDs that define walkable ground (layer 0). */
  floorGids: ReadonlySet<number>;
  /** GIDs for walkable props/decor on upper layers. */
  walkablePropGids: ReadonlySet<number>;
}

export interface CollisionGrid {
  width: number;
  height: number;
  /** Row-major: 1 = solid/blocked, 0 = walkable. */
  solid: Uint8Array;
}

/** Derives a walkability mask from layered tile GIDs. Floor GIDs
 * are always walkable; walkable-prop GIDs override solid tiles on
 * upper layers; everything else is solid. */
export function buildCollisionGrid(
  map: TmxMap,
  opts: BuildCollisionGridOptions,
): CollisionGrid;
```

### What the module does NOT do

- **Batched/baked renderer pass** — the tilemap example bakes the layer
  to a single offscreen canvas, which is a consumer-level optimization.
  The module spawns standard sprite entities; the consumer decides
  whether to render per-entity or pre-bake.
- **Object-layer spawning** — object layers are game-specific (enemy
  spawn points, trigger zones, etc.). Keep the module focused on tile
  layers.
- **Pathfinding or advanced collision queries** — use `modules/pathfinding`
  - manual grid lookups. The `CollisionGrid` is a data structure, not a
  query engine.

### Module dependency

`modules/tilemap` depends on `modules/tmx` (parse types) and
`modules/render-canvas2d` / `modules/texture-atlas` (renderable + atlas
types). This is a documented cross-module dep, same pattern as
`modules/collision` → `modules/math` (`clamp`).

## Implementation checklist

- [x] Create `src/modules/tilemap/` directory
- [x] `src/modules/tilemap/atlas.ts` — `buildTilemapAtlas()`
- [x] `src/modules/tilemap/spawn.ts` — `spawnTilemap()`
- [x] `src/modules/tilemap/collision-grid.ts` — `buildCollisionGrid()`
- [x] `src/modules/tilemap/tile-transform.ts` — `tileTransform()`
- [x] `src/modules/tilemap/index.ts` — barrel
- [x] `src/modules/tilemap/atlas.test.ts` — unit tests (5)
- [x] `src/modules/tilemap/spawn.test.ts` — unit tests (14)
- [x] `src/modules/tilemap/collision-grid.test.ts` — unit tests (8)
- [x] `src/modules/tilemap/tile-transform.test.ts` — unit tests (8)
- [x] `package.json` — `./modules/*` wildcard already covers `./modules/tilemap` (no change needed)
- [x] `docs/agent/engine-api.md` — regenerated (`npm run docs:api`)
- [x] `src/modules/tilemap/README.md` — reference doc
- [x] `examples/tilemap/src/main.ts` — migrated to `buildTilemapAtlas()` + `spawnTilemap()`
- [x] `examples/rpg/src/map.ts` — migrated to `buildTilemapAtlas()` + `spawnTilemap()` + `buildCollisionGrid()` + `tileTransform()`
- [x] `examples/rpg/src/flip.ts` — deleted (replaced by `tileTransform` from module)
- [x] Lint + typecheck + full test suite green (912 tests, 61 files)
- [ ] Peer review → LGTM
- [ ] Move plan to `docs/plans/done/` in final commit
