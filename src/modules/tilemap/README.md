# `@pierre/ecs/modules/tilemap`

Tile-layer spawn and collision-grid helpers for Tiled (`.tmx`) maps.
Composes with `modules/tmx` (parse), `modules/texture-atlas` (frame
registry), `modules/render-canvas2d` (sprite renderables), and
`modules/transform` (position + optional rotation/scale).

## Exports

### `buildTilemapAtlas(opts)`

Collects every unique GID across all visible tile layers, resolves each
to its source rectangle via `gidToFrame`, and registers the frames in a
new `TextureAtlasRegistry`. Returns the registry ready for
`Canvas2DRenderContext.atlases`.

```ts
const atlas = buildTilemapAtlas({ map, image, name: 'dungeon' });
```

### `spawnTilemap(opts)`

Spawns one sprite entity per non-empty tile across every visible layer.
Each entity receives `PositionDef`, `RenderableDef` (sprite, with H/V
flips resolved), and `RenderOrderDef` (layer index).

```ts
const count = spawnTilemap({ world, map, atlas: 'dungeon' });
```

Optional `onTile` callback for per-tile customisation (D4 transforms,
collision tags, etc.). Optional `anchor` for centre-aligned sprites.

### `buildCollisionGrid(map, opts)`

Derives a walkability mask (`CollisionGrid`) from layered tile GIDs
using two allowlists: floor GIDs and walkable-prop GIDs.

```ts
const grid = buildCollisionGrid(map, {
  floorGids: new Set([1, 2, 3]),
  walkablePropGids: new Set([10, 11]),
});
const blocked = grid.solid[row * grid.width + col] === 1;
```

### `tileTransform(flags)`

Resolves a per-tile flip-flag bitfield to the full 8-orientation D4
dihedral group transform `{ angle, sx, sy }`. Use inside `onTile` with
`anchor: 'center'`, `RotationDef`, and `ScaleDef` for tiles that need
diagonal flips.

```ts
spawnTilemap({
  world, map, atlas: 'dungeon', anchor: 'center',
  onTile: (id, _gid, flags) => {
    const t = tileTransform(flags);
    if (t.angle !== 0) world.getStore(RotationDef).set(id, { angle: t.angle });
    if (t.sx !== 1 || t.sy !== 1) world.getStore(ScaleDef).set(id, { x: t.sx, y: t.sy });
  },
});
```

## Dependencies

- `modules/tmx` — `TmxMap`, `TmxLayer`, `gidToFrame`, `TMX_FLIP_*`
- `modules/texture-atlas` — `TextureAtlasRegistry`
- `modules/render-canvas2d` — `RenderableDef`, `RenderOrderDef`
- `modules/transform` — `PositionDef`

## What this module does NOT do

- **Batched/baked tilemap rendering** — the tilemap example bakes the
  layer to a single offscreen canvas, which is a consumer-level
  optimization. This module spawns standard sprite entities; the
  consumer decides how to render.
- **Object-layer spawning** — object layers are game-specific. Keep
  those in app code.
- **Pathfinding or advanced grid queries** — use `modules/pathfinding`
  plus manual `CollisionGrid` lookups.
