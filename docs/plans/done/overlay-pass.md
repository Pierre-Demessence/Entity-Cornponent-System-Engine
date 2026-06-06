# RenderableDef Adoption + Screen-Space Overlay Pass

Plan for item #9 of `local-to-engine-migration.md`.

## Goal

1. **Build**: Add a screen-space overlay pass to `Canvas2DRenderer` so
   HUD/UI entities draw in pixel coordinates, independent of the camera
   transform.
2. **Adopt**: Migrate local-pong and snake off their hand-rolled `render()`
   functions onto the engine's `RenderableDef` + `Canvas2DRenderer`.

## Current state

Both local-pong and snake have monolithic `render()` functions that clear
the canvas, draw background decorations, draw game entities (paddles, ball,
snake segments, food), and draw HUD/overlay (scores, game-over) — all via
raw `ctx2d.fillRect`/`fillText`/`strokeRect` calls. Neither uses
`RenderableDef` or `Canvas2DRenderer`.

The engine's `Canvas2DRenderer` draws entities with `PositionDef +
RenderableDef` in world space through an optional camera `view` transform.
There's no way to mark some entities as screen-space.

## Design

### `ScreenSpaceDef` — a boolean tag component

```ts
const ScreenSpaceDef: ComponentDef<{ value: true }>;
```

When an entity carries `ScreenSpaceDef`, the renderer draws it in screen
pixels (no camera transform, no culling). Entities without it are drawn
in world space through the camera (existing behavior).

### Two-pass render

The `Canvas2DRenderer.render()` method gains an internal second pass:

1. **World pass** (existing): draw entities without `ScreenSpaceDef`,
   through camera `view`, sorted by `RenderOrderDef`
2. **Overlay pass** (new): restore canvas transform, draw entities with
   `ScreenSpaceDef`, in pure screen coordinates, sorted by `RenderOrderDef`

Both passes read `PositionDef`, `RenderableDef`, and optional
`RotationDef`/`ScaleDef`/`OpacityDef`.

### No canvas clear

The renderer never clears the canvas — callers own that. Static background
elements (court lines, center circle) can stay as manual canvas calls before
the renderer runs, or become world-space entities.

## Subtasks

- [x] Add `ScreenSpaceDef` component to `render-canvas2d`
- [x] Modify `Canvas2DRenderer.render()` for two-pass (world + overlay)
- [x] Unit tests for two-pass rendering with ScreenSpaceDef
- [x] Export `ScreenSpaceDef` from module barrel
- [x] Regenerate `engine-api.md`
- [x] Migrate local-pong: game entities → `RenderableDef`, HUD → screen-space entities
- [x] Migrate snake: grid coords prevent clean RenderableDef adoption — skipped
- [x] Typecheck + lint + test — all green
- [x] Update migration doc row #9
