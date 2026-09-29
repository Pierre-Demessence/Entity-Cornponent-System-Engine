# @pierre/ecs/modules/render-dom

DOM-backed renderer primitives for ECS games.

V1 scope: stable entity-to-node bookkeeping, optional z-order via
`RenderOrderDef`, orphan cleanup, and deterministic `data-entity-id`
attributes for hit-testing.

## API

```ts
interface DomRenderContext {
  root: HTMLElement;
  world: EcsWorld;
}

interface DomRenderable {
  tag?: string;
  className?: string;
  text?: string;
  attributes?: Record<string, string>;
  dataset?: Record<string, string>;
  style?: Record<string, string>;
  hidden?: boolean;
}

const DomRenderableDef: ComponentDef<DomRenderable>;

interface DomRendererOptions {
  reconcile?: (args: {
    entityId: EntityId;
    node: HTMLElement;
    renderable: DomRenderable;
    world: EcsWorld;
  }) => void;
}

class DomRenderer implements Renderer<DomRenderContext> {
  constructor(options?: DomRendererOptions);
  render(ctx: DomRenderContext): void;
}

function entityAtPoint(x: number, y: number, root?: Element): EntityId | null;
```

## Picking

`entityAtPoint(clientX, clientY, root?)` answers "which entity is under the
pointer?" for anything `DomRenderer` drew. It asks the browser for the topmost
element at the point and walks up to the nearest node carrying
`data-entity-id`, so a hit on a node's child text still resolves to the entity.

```ts
import { entityAtPoint } from '@pierre/ecs/modules/render-dom';

const container = document.getElementById('game')!;
container.addEventListener('pointerdown', (ev) => {
  const id = entityAtPoint(ev.clientX, ev.clientY, container);
  if (id !== null)
    console.log('picked entity', id);
});
```

- Coordinates are **client** pixels (`clientX` / `clientY`), what the browser
  hit-tests in.
- Pass `root` to ignore entities rendered outside it — a second renderer on
  the page, or an overlay.
- An element with `pointer-events: none` is invisible to the browser's hit
  test. Put a dragged node in a layer styled that way so the drop target under
  it stays pickable.

## Notes

- The renderer always writes `data-entity-id` and keeps that attribute engine-owned.
- V1 intentionally supports only `text` content, not `innerHTML`.
- Attribute validation rejects `on*`, `srcdoc`, and class/style duplicates;
  use `className`, `dataset`, and `style` fields instead.
- Nodes are absolutely positioned using `left/top` from `PositionDef`; the
  `style` object rejects `left`, `top`, and `position` because those keys are
  engine-owned.
- `reconcile` runs after base reconciliation and can be used for
  per-entity adjustments (for example, zone-based layout overrides in
  DOM-heavy UIs).

## Dependencies

- `modules/transform` — `PositionDef` for each node's `left` / `top`.
- `modules/render-canvas2d` — `RenderOrderDef` for z-order.
