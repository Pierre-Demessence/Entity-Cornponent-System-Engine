# `@pierre/ecs/modules/render-canvas2d`

Default Canvas 2D renderer for ECS entities that carry `PositionDef +
RenderableDef`. Ships alongside the `Renderer<TCtx>` interface from
`@pierre/ecs/renderer` and the `AnimationFrameTickSource` from
`@pierre/ecs/modules/tick`.

Canon: Pixi `Graphics`, Phaser `Rectangle`/`Arc` GameObjects, LÖVE
`love.graphics.rectangle`/`circle`.

## API

```ts
// Component: discriminated union of shapes
type Renderable =
  | { kind: 'rect'; w: number; h: number; fill?: string; stroke?: string; lineWidth?: number }
  | { kind: 'circle'; radius: number;     fill?: string; stroke?: string; lineWidth?: number };

const RenderableDef: ComponentDef<Renderable>;

// Renderer: draws every entity with Position + Renderable
class Canvas2DRenderer implements Renderer<{ ctx2d: CanvasRenderingContext2D; world: EcsWorld }> {
  render(ctx): void;
}
```

## Usage

```ts
import { AnimationFrameTickSource } from '@pierre/ecs/modules/tick';
import { Canvas2DRenderer, RenderableDef } from '@pierre/ecs/modules/render-canvas2d';
import { PositionDef } from '@pierre/ecs/modules/transform';

world.registerComponent(PositionDef);
world.registerComponent(RenderableDef);

// Data-driven draws
world.getStore(RenderableDef).set(coinId, {
  kind: 'circle', radius: 6, fill: '#f4c542',
});
world.getStore(RenderableDef).set(platformId, {
  kind: 'rect', w: 80, h: 16, fill: '#5a6577', stroke: '#8aa0bd',
});

const renderer = new Canvas2DRenderer();
const rafSource = new AnimationFrameTickSource();
rafSource.subscribe(() => {
  ctx2d.fillStyle = '#000';
  ctx2d.fillRect(0, 0, W, H);           // consumer clears
  renderer.render({ ctx2d, world });    // module draws shapes
  drawHud(ctx2d, state);                 // consumer overlays HUD
});
rafSource.start();
```

## Anchors

- `rect`: `Position` = top-left corner of the rectangle.
- `circle`: `Position` = centre of the circle.

This matches the way physics-aware entities are usually anchored:
bounding-box entities (platforms, players) sit at their top-left corner;
round entities (bullets, balls, planets) track their centre.

## What ships in v1

Entities drawn in component-store iteration order. **No** rotation,
scale, opacity, sprite, or z-ordering in v1 — they'll land when a
real consumer needs them (Path-A rule of three).

Notes:

- `RenderableDef` declares `requires: ['position']` — registering it
  without `PositionDef` also registered throws at registration time.
- An entity whose `Renderable` has neither `fill` nor `stroke` set is
  skipped (nothing drawn). Supply at least one to make a shape visible.
- The renderer wraps its draw loop in `ctx2d.save()` / `restore()` so
  your canvas state after `renderer.render()` is unchanged.

Consumers handle:

- Canvas clear / background
- Entities that need rotation, thrust flames, animated effects
  (draw them in a custom overlay pass before/after `renderer.render()`)
- HUD, score, game-over screens
- Pixel scaling, viewport transforms, camera (reserved for `modules/camera`)
