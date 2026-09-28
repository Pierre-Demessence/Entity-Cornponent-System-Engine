# `@pierre/ecs/modules/render-scene3d`

Keeps a scene graph in step with the world: one scene object per selected
entity, created the first frame the entity is selected, updated every frame,
and removed from the graph once the entity stops matching. It works with any
scene graph that can add and remove an object — a three.js `Scene` is passed in
directly.

It manages which objects exist. What each object looks like, the camera, the
canvas and the GPU resources stay with your code.

## API

```ts
interface SceneGraph<TObject> {
  add: (object: TObject) => void;
  remove: (object: TObject) => void;
}

interface Scene3DRenderContext<TObject> {
  graph: SceneGraph<TObject>;
  world: EcsWorld;
}

type Scene3DEntry<TRow extends unknown[]> = [EntityId, ...TRow];

interface Scene3DRendererOptions<TObject, TRow extends unknown[]> {
  select: (world: EcsWorld) => Iterable<Scene3DEntry<TRow>>;
  create: (entry: Scene3DEntry<TRow>, world: EcsWorld) => TObject;
  sync?: (object: TObject, entry: Scene3DEntry<TRow>, world: EcsWorld) => void;
}

class Scene3DRenderer<TObject, TRow extends unknown[] = unknown[]>
  implements Renderer<Scene3DRenderContext<TObject>> {
  constructor(options: Scene3DRendererOptions<TObject, TRow>);
  render(ctx: Scene3DRenderContext<TObject>): void;
  get(entityId: EntityId): TObject | undefined;
  dispose(graph: SceneGraph<TObject>): void;
}
```

- **`select`** runs every frame and returns the entities this pass draws —
  usually a `world.query(...)` narrowed with `.withTag(...)` and
  `.without(...)`. Its component columns become the entry `create` and `sync`
  receive, typed.
- **`create`** builds the object for an entity the first frame it is selected.
- **`sync`** runs every frame the entity is selected, including the frame it
  was created: copy position, scale, material, visibility.
- **`get`** returns the object held for an entity, for code that adjusts it
  after the pass.
- **`dispose`** removes every object this pass created from the graph and
  forgets it. It does not dispose geometries, materials or textures — those
  were built by your `create` and stay yours to release.

## Usage

One renderer per kind of object, run in sequence like any array of renderers.
With three.js, the graph is the `Scene`:

```ts
import type { EcsWorld } from '@pierre/ecs';

import { Scene3DRenderer } from '@pierre/ecs/modules/render-scene3d';
import { Position3DDef } from '@pierre/ecs/modules/transform-3d';

// Stand-ins for `THREE.Mesh` and `THREE.Scene`.
interface Mesh { position: { set: (x: number, y: number, z: number) => void } }
declare const scene: { add: (m: Mesh) => void; remove: (m: Mesh) => void };
declare function makeCrateMesh(): Mesh;
declare const world: EcsWorld;

const crates = new Scene3DRenderer({
  select: w => w.query(Position3DDef).withTag(w.getTag({ name: 'crate' })),
  create: () => makeCrateMesh(),
  sync: (mesh, [, p]) => mesh.position.set(p.x, p.y, p.z),
});

// Each frame, before drawing the scene:
crates.render({ graph: scene, world });
```

### Overlapping tags

When an entity carries two tags that each have a pass, both passes draw it.
Exclude the more specific tags from the general pass so it gets one object:

```ts
const statics = new Scene3DRenderer({
  select: w => w.query(Position3DDef)
    .withTag(w.getTag(StaticBodyTag))
    .without(w.getTag(DoorTag)),
  create: () => new THREE.Mesh(box, wallMaterial),
});
```

### Resetting the world

`world.clearAll()` and `world.loadJSON(...)` start entity ids again from the
beginning, so a new entity can arrive with the id of an old one. The renderer
cannot tell the two apart and keeps the old object. Either call
`dispose(graph)` after resetting the world, so the next `render` builds
everything fresh, or set every per-entity property (material, sprite) in `sync`
rather than `create`, so an object never depends on which entity it was built
for.

## Notes

- An entity leaves a pass for any reason `select` stops yielding it: a removed
  tag or component, an excluded tag added, or the entity destroyed. Its object
  is removed from the graph that frame; if it comes back, `create` builds a new
  one.
- `select` can return any iterable of `[id, ...values]` entries, not only a
  query.
- No cross-module source dependency. The pose components a `select` reads
  usually come from [`modules/transform-3d`](../transform-3d/README.md), but
  this module never reads a component itself.

## Not included (by design)

- **Drawing.** It never calls the backend's render: you draw the scene with
  your camera after the passes run.
- **The canvas, resizing and the graphics context.** Those belong to the code
  that owns the canvas; a pass has none.
- **A camera.** Position it in your own code.
- **A 3D drawable component.** Whether an entity becomes a box, a sprite or a
  loaded model is decided by your `create`.
- **Copying `Rotation3D` / `Scale3D` onto objects.** Set them in `sync` when
  your entities store them.
- **Draw order.** Set the backend's own property (three.js `renderOrder`) in
  `sync`.
