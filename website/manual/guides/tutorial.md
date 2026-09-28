# Build a moving, drawn scene

A walkthrough from an empty folder to a rectangle that moves across the screen
and is drawn, using nothing but shipped primitives. It is a single file built up
over seven steps, and every snippet is typechecked against the current source.

## 1. Install the engine

The engine is pre-release and not published to npm, so it is consumed as a
sibling folder through a `file:` install:

```json
{
  "dependencies": {
    "@pierre/ecs": "file:../Entity-Cornponent-System-Engine"
  }
}
```

The package's `exports` map points straight at TypeScript sources, so a
TypeScript-aware bundler — Vite is what every [example](../../getting-started/examples/) uses — needs no
build step. Projects that neither bundle nor transpile need one.

## 2. Create a world and a canvas

The world is the registry everything else hangs off. The canvas is where the
scene will be drawn in step 7.

```ts
import { EcsWorld } from '@pierre/ecs';

const WIDTH = 480;
const HEIGHT = 270;

const canvas = document.createElement('canvas');
canvas.width = WIDTH;
canvas.height = HEIGHT;
document.body.append(canvas);
const ctx2d = canvas.getContext('2d')!;

const world = new EcsWorld();
```

A world starts empty. It knows no components and no entities until you tell it.

## 3. Register the components you need

Two components are enough for this: a position, and something to draw. Both ship
with the engine — `position` lives in the transform module, `renderable` in the
canvas renderer.

```ts
import { RenderableDef } from '@pierre/ecs/modules/render-canvas2d';
import { PositionDef } from '@pierre/ecs/modules/transform';

world.registerComponent(PositionDef);
world.registerComponent(RenderableDef);
```

Registering gives you a store for that component type and reserves its name in
the world. Names must be unique per world, so this happens once, at startup.

## 4. Spawn an entity

`spawn` takes a template: a name for debugging, and the components to put on the
new entity, keyed by the name each component registered under.

```ts
world.spawn({
  name: 'box',
  components: {
    position: { x: 40, y: 120 },
    renderable: { kind: 'rect', w: 32, h: 32, fill: '#3369ff' },
  },
});
```

`renderable` declares that it requires `position`, so the two travel together.

## 5. Move it, once per tick

A system is a function over the world, and what it receives is the **tick
context** — an object your project defines. The narrowest useful shape is the
world plus how long the last tick covered, so that is what this one declares.
Step 6 creates the object and hands it to the system on every tick.

```ts
interface Sim {
  dtMs: number;
  world: EcsWorld;
}

const moveSystem = {
  name: 'move',
  run: (ctx: Sim): void => {
    for (const [entity, position] of ctx.world.query(PositionDef)) {
      const next = (position.x + (60 * ctx.dtMs) / 1000) % WIDTH;
      ctx.world.move(entity, next, position.y);
    }
  },
};
```

Two things worth noticing:

- **Position goes through `world.move`**, not by writing the component. That is
  the engine's one hard rule about positions: a direct write leaves the spatial
  index — if you have enabled one — believing the old value. See
  [`world`](../../core/world/).
- **Movement is scaled by `dtMs`.** The system does not assume a frame rate;
  what it is given is how long the last tick covered.

## 6. Drive the loop

Nothing has run yet. `Scheduler` orders systems, a `TickSource` decides when
ticks fire, and `TickRunner` performs the per-tick ceremony between them.

```ts
import { Scheduler, TickRunner } from '@pierre/ecs';
import { AnimationFrameTickSource } from '@pierre/ecs/modules/tick';

const sim: Sim = { dtMs: 0, world };

const scheduler = new Scheduler<Sim>().add(moveSystem);
const source = new AnimationFrameTickSource();
const runner = new TickRunner<Sim>({
  scheduler,
  source,
  contextFactory: (info) => {
    sim.dtMs = info.deltaMs ?? 16;
    return sim;
  },
  getEvents: () => ({ flush: () => {} }),
  getWorld: () => world,
});
runner.start();
```

- `AnimationFrameTickSource` asks the browser for a frame and ticks once per
  frame; [`modules/tick`](../../modules/tick/) ships three others, including a
  fixed-timestep one for physics that must not vary with frame rate.
- `contextFactory` builds the object systems receive — here, the same `sim`
  object with the frame's delta written into it. It runs before each tick and
  always writes `dtMs` first, so the `0` it starts from is never seen by a
  system. Reusing one object is a choice, not a rule: a fresh one per tick is
  equally valid.
- `getEvents` returns a no-op flusher because this scene emits no events. A
  scene that does hands its event bus over here, and events drain at the end of
  each tick.

## 7. Draw it

Drawing is not a tick. The renderer runs on the browser's paint loop, reading
the world as it currently is.

```ts
import { Canvas2DRenderer } from '@pierre/ecs/modules/render-canvas2d';

const renderer = new Canvas2DRenderer();

function frame(): void {
  ctx2d.fillStyle = '#0b0b0f';
  ctx2d.fillRect(0, 0, WIDTH, HEIGHT);
  renderer.render({ ctx2d, world });
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
```

`Canvas2DRenderer` draws every entity that carries `position` and `renderable`;
shapes, anchors, rotation, scale, opacity and z-order all come from the
components the entity has. Nothing needs to be registered with the renderer.

That is the whole scene: a rectangle that drifts right at 60 pixels per second
and wraps, drawn by the engine's default renderer.

## Where to go next

- [The model](../../concepts/model/) — what entities, components and archetypes
  actually are, and why the query above is cheap.
- [Ticks, frames and system order](../../concepts/ticks-and-order/) — why step 6
  and step 7 are separate loops, and how to order more than one system.
- [Structural changes](../../concepts/structural-changes/) — what to expect when
  entities start gaining and losing components.
- [Module index](../../getting-started/module-index/) — the modules that add sprites,
  input, collision, cameras and the rest.
