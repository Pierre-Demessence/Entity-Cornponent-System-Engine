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
```

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
