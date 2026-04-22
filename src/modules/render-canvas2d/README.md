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
  | { kind: 'rect'; w: number; h: number; anchor?: 'top-left' | 'center';
      fill?: string; stroke?: string; lineWidth?: number;
      blendMode?: GlobalCompositeOperation }
  | { kind: 'circle'; radius: number; anchor?: 'top-left' | 'center';
      fill?: string; stroke?: string; lineWidth?: number;
      blendMode?: GlobalCompositeOperation }
  | { kind: 'polygon'; points: readonly { x: number; y: number }[]; closed: boolean;
      fill?: string; stroke?: string; lineWidth?: number;
      blendMode?: GlobalCompositeOperation }
  | { kind: 'text'; text: string; font: string;
      align?: CanvasTextAlign; baseline?: CanvasTextBaseline;
      fill?: string; stroke?: string; lineWidth?: number;
      blendMode?: GlobalCompositeOperation };

const RenderableDef: ComponentDef<Renderable>;

// Optional overlay components (see "Transform overlay" below)
const OpacityDef: ComponentDef<{ value: number }>;         // 0..1
const RenderOrderDef: ComponentDef<{ value: number }>;     // ascending = later = on top

// Renderer: draws every entity with Position + Renderable
class Canvas2DRenderer implements Renderer<{ ctx2d: CanvasRenderingContext2D; world: EcsWorld }> {
  render(ctx): void;
}
```

The renderer also reads, when registered, `RotationDef` and
`ScaleDef` from `@pierre/ecs/modules/transform`.

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

Each variant has a default anchor (the meaning of `PositionDef` for
that shape). Override with `anchor: 'top-left' | 'center'` where
applicable.

| Variant   | Default anchor | `anchor: 'top-left'` | `anchor: 'center'` |
| --------- | -------------- | -------------------- | ------------------ |
| `rect`    | `top-left`     | draws (x, y) → (x+w, y+h) | draws (x-w/2, y-h/2) → (x+w/2, y+h/2) |
| `circle`  | `center`       | draws circle centred on (x+r, y+r) (useful when positions are AABB top-lefts) | draws circle centred on (x, y) |
| `polygon` | pivot at (x, y) — polygon-local points are offsets | — | — |
| `text`    | pivot at (x, y) — final alignment controlled by `textAlign`/`textBaseline` | — | — |

This matches the way physics-aware entities are usually anchored:
bounding-box entities (platforms, players) sit at their top-left
corner; round entities (bullets, balls, planets) track their centre.
When a game keeps physics data at AABB top-left but wants to render a
circle (e.g. a platformer coin), set `anchor: 'top-left'` on the
circle so the drawn centre lands at the AABB midpoint without any
bespoke render/pickup logic.

## Transform overlay

The renderer optionally reads extrinsic transform components:

- `RotationDef { angle: number }` (radians). Rotates around
  `PositionDef`. Canon: Pixi/Phaser/LÖVE `.rotation`.
- `ScaleDef { x: number; y: number }`. Scales around
  `PositionDef`. Canon: Pixi/Phaser/LÖVE `.scale`.
- `OpacityDef { value: number }` in `[0, 1]`. Multiplies
  `globalAlpha`. Canon: Pixi `.alpha`, Phaser `.alpha`, LÖVE
  `setColor`'s alpha channel.
- `RenderOrderDef { value: number }`. Ascending `value` draws later
  (on top). Ties fall back to component-store insertion order.
  Canon: Pixi/Phaser `zIndex` / `depth`.

All four are optional. The renderer only pays for features the world
actually uses: when no entity carries `RenderOrderDef`, the sort is
skipped entirely; rotation/scale are only applied when non-default;
when neither `RotationDef`, `ScaleDef`, `OpacityDef`, nor
`blendMode` apply to an entity, the draw path is byte-identical to V1
(no per-entity `save`/`restore`).

## Validation

- `RenderableDef` declares `requires: ['position']` — registering it
  without `PositionDef` also registered throws at registration time.
- Polygons require at least 2 points. Open polygons (`closed: false`)
  may not set `fill` — Canvas2D's `fill()` auto-closes paths, which
  would produce an unintended shape; the validator rejects this with
  a clear message pointing to `closed: true` or removing `fill`.

## What ships in v2

Shape variants: `rect`, `circle`, `polygon`, `text`. Per-variant
anchor for rect/circle. Extrinsic overlays: `RotationDef`,
`ScaleDef`, `OpacityDef`, `RenderOrderDef`, per-entity
`blendMode`.

Deferred (see `docs/roadmap/ecs-module-backlog.md`):

- Sprites / textures — needs an asset-loader module first.
- Tilemap kind — Path-A (wait for a second consumer).
- Canvas filters (`ctx.filter`) — Path-A.
- Snake migration — needs a camera zoom/transform (`modules/camera`
  V2).

Notes:

- `RenderableDef` declares `requires: ['position']` — registering it
  without `PositionDef` also registered throws at registration time.
- An entity whose `Renderable` has neither `fill` nor `stroke` set is
  skipped (nothing drawn). Supply at least one to make a shape visible.
- The renderer wraps its draw loop in `ctx2d.save()` / `restore()` so
  your canvas state after `renderer.render()` is unchanged. Per-entity
  isolation is only applied when needed (transform/opacity/blend).

Consumers handle:

- Canvas clear / background
- HUD, score, game-over screens
- Pixel scaling, viewport transforms, camera (reserved for `modules/camera`)
