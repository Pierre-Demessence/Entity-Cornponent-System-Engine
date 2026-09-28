# Draw beyond the default renderer

`Canvas2DRenderer` draws every entity carrying `position` and `renderable`, which
covers a lot. This is for what it does not: a HUD, a custom pass, or a scene
where you would rather own the drawing order entirely.

## The default pass, explicitly

The renderer is a single call, and it is worth knowing what it can already do
before working around it:

```ts
import { Canvas2DRenderer } from '@pierre/ecs/modules/render-canvas2d';

const renderer = new Canvas2DRenderer();

renderer.render({ ctx2d, world });
```

Its context is worth reading once — `Canvas2DRenderContext` carries the 2D
context, the world, optional sprite `atlases`, and an optional camera `view`.
Everything else the renderer reads, it reads from components on the entities:
`rotation`, `scale`, `opacity`, `renderOrder`, and screen-space for entities that
should ignore the camera. Adding any of those to an entity changes how it is
drawn, with nothing to register.

## Wrap it with your own passes

The renderer clears nothing and draws only entities, so a HUD is a before-and-after
around it rather than a replacement:

```ts
function frame(): void {
  ctx2d.fillStyle = '#0b0b0f';
  ctx2d.fillRect(0, 0, WIDTH, HEIGHT);

  renderer.render({ ctx2d, world });

  ctx2d.fillStyle = '#ccc';
  ctx2d.font = '16px system-ui';
  ctx2d.fillText(`Score: ${score}`, 12, 22);

  requestAnimationFrame(frame);
}
```

This is what the examples do — see
[`examples/asteroids`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/asteroids),
whose render pass is a clear, the entity pass, then a HUD.

Draw order inside your own pass is canvas state, so set `globalAlpha`,
`transform` and `font` before you draw rather than expecting the engine to
restore them.

## When to skip the renderer

The renderer exists to make the common case a component. Reach past it when:

- **The renderer is the wrong medium.** `modules/render-dom` drives DOM nodes
  instead — `examples/card-battler` uses it for card play, which is the proof
  that the renderer interface is not canvas-coupled.
- **You need a pass the renderer has no concept of** — shadows, a mask, a
  two-pass blur. Wrap the call, or write the pass yourself and keep the entity
  draw for what it is good at.
- **You are drawing between simulation states.** If the simulation runs on a
  fixed step, interpolate at draw time — see
  [Run physics on a fixed timestep](../fixed-timestep/). The renderer draws the
  world as it is; blending two states is the caller's job.

## See also

- [`modules/render-canvas2d`](../../modules/render-canvas2d/) — shapes, anchors
  and the optional components.
- [`modules/render-dom`](../../modules/render-dom/) — the non-canvas renderer.
- [Build a moving, drawn scene](../tutorial/) — the same
  renderer in a minimal program.
