# Honour GID Flip/Rotation Bits in Sprite Renderer

Plan for adding `flipH`/`flipV` to the `Renderable` sprite variant and
honouring them in `Canvas2DRenderer`.

## Motivation

`modules/tmx` already unpacks `TMX_FLIP_H`/`TMX_FLIP_V`/`TMX_FLIP_D`
from tile GIDs into `TmxLayer.flags`. But the sprite renderer draws
every tile unflipped — flipped tiles from Tiled maps render incorrectly.

Every 2D engine supports sprite flipping:
- Godot — `Sprite2D.flip_h` / `flip_v`
- Unity — `SpriteRenderer.flipX` / `flipY`
- Phaser — `Sprite.flipX` / `flipY`
- PixiJS — `Sprite.scale.x = -1`

## Changes

### 1. `Renderable` sprite variant — add optional flip booleans

```typescript
| {
    kind: 'sprite';
    atlas: string;
    frame: string;
    dw?: number;
    dh?: number;
    anchor?: RectAnchor;
    blendMode?: GlobalCompositeOperation;
    flipH?: boolean;  // NEW
    flipV?: boolean;  // NEW
  }
```

### 2. `canvas2d-renderer.ts` — apply flip transform

When `flipH` or `flipV` is true, wrap the sprite draw with
`ctx2d.save()/translate(originX, originY)/scale(±1, ±1)/drawImage/restore()`.

### 3. `RenderableDef.deserialize` — validate new optional fields

Add `asBoolean` validation for `flipH`/`flipV` when present.

### 4. TMX consumers — wire flip flags

Update the tilemap example (and rpg map loader) to pass flip flags
from `TmxLayer.flags` into `Renderable.flipH`/`flipV` when spawning tiles.

## Implementation checklist

- [x] Add `flipH?`/`flipV?` to `Renderable` sprite variant in `renderable.ts`
- [x] Update `RenderableDef.deserialize` to handle new fields
- [x] Apply flip transform in `canvas2d-renderer.ts` sprite draw path
- [x] Update `render-canvas2d` tests
- [x] Wire flip flags in tilemap example `map.ts`
- [x] Run `npm test` — all tests pass
- [x] Run `npm run docs:api`
- [x] Update `engine-gap-ledger.md` — mark GID flip row as resolved
- [ ] Update `ecs-module-backlog.md` — mark RenderableDef V3 GID flip as shipped
