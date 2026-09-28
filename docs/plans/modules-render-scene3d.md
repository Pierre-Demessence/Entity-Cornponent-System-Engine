# Plan — `modules/render-scene3d`: entity ↔ scene-object reconciliation

The 3D sibling of `modules/render-canvas2d` and `modules/render-dom`, and the
last of the four hand-rolled 3D duplicates to lift. Backlog entry: the 3D
sibling table's `modules/render-scene3d` row — "Entity ↔ scene-object sync:
create / update / reap by tag — the 3D analogue of `Canvas2DRenderer`",
**ready**, gate "Scheduling — build slot", on the strength of four consumers.

## What the module is, and what it is not

**Is:** a reconciler. One scene object per entity, created when the entity
first matches, updated every frame, removed from the graph when it stops
matching. It owns the bookkeeping — that is the duplicated part.

**Is not:** a renderer in the `Renderable` sense, and not a surface owner. It
creates no canvas, holds no GL context, does not listen for `resize`, and never
calls `WebGLRenderer.render(scene, camera)`. The consumer still owns the
`WebGLRenderer`, the scene, the camera and the lights.

**Is not `render-threejs`.** `three` is an example-level dependency
(`examples/doom/package.json`) and is absent from the engine's `package.json`,
so a vendor-named module could not import what it is named for. The module is
generic over `TObject`; three.js is the default thing a consumer passes in, the
way `HashGrid2D` is the default `SpatialStructure`.

## Dual-sided verification

**Engine — ABSENT.**

- `src/modules/` holds `render-canvas2d` and `render-dom` and no third renderer;
  there is no `render-scene3d`, and no `Renderable3D` / `Scene3D` symbol
  anywhere in `src/`.
- `src/renderer.ts` is one method (`Renderer<TCtx>` = `render(ctx) => void`) and
  says renderers "do NOT own the tick loop, canvas, or world" and that a
  consumer may hold **an array of renderers** drawing into one canvas.
- ABSENT: any scene-object reconciliation, any object-keyed bookkeeping.

**Consumers — four examples, the same skeleton copied ~16×.**

- **The skeleton, character for character.** `Map<EntityId, TObject>` + a
  `Set<EntityId>` of ids seen this frame + create-on-miss + reap-unseen
  (`scene.remove` + `delete`), then `clear()` the seen-set.
  - `examples/platformer-3d/src/render.ts:59-105` — `meshes` (59), `touched`
    (60), `ensureMesh` (62), `syncFromTag` (80), `reapUntouched` (101).
  - `examples/doom/src/render.ts:79-163` (statics + enemy sprites),
    `:168-193` (projectiles: `projMeshes`/`projTouched`),
    `:197-225` (pickups: `pickupMeshes`/`pickupTouched`).
  - `examples/portal/src/render.ts:521-560` and
    `examples/starfighter/src/render.ts:128` run the same loop for their own
    object classes.
  - doom alone repeats it four times; the four examples together, roughly
    sixteen.
- **The iteration source is always a tag, and the pose is always
  `Position3DDef`.** `for (const id of state.world.getTag(ProjectileTag))` +
  `posStore.get(id)` (doom:174-179); `syncFromTag(state, PlayerTag | CoinTag |
  StaticBodyTag, kind)` (platformer-3d:80-105).
- **The `create` step is consumer-specific.** `ensureMesh(id, kind)` chooses
  geometry and material per tag (platformer-3d:62-78); doom's pickup mesh reads
  a game component to pick its material
  (`pickupStore.get(id)?.kind` — doom:217-221). This is the 20% the module must
  not try to own.
- **`Renderer3D` is declared four times**, identically:
  `{ domElement: HTMLCanvasElement; dispose: () => void; render: (state) =>
  void; resize: (w, h) => void }` — `examples/doom/src/render.ts:16`,
  `examples/platformer-3d/src/render.ts:16`, `examples/portal/src/render.ts:31`,
  `examples/starfighter/src/render.ts:17`.
- **Singleton objects are not this pattern, and stay consumer-side.** doom's
  hitscan tracer is one reusable `THREE.Line` toggled by `visible`
  (`examples/doom/src/render.ts:238-260`) — not N-entities → N-objects.

**Canon (corroborating, not load-bearing — the four consumers already clear the
bar on their own).**

- **Scene-graph object composition — VERIFIED in the backlog's citation.**
  three.js `Object3D.add` / `remove`, Babylon `TransformNode` / `Scene`
  parenting.
- **The reconciler shape — VERIFIED this pass.** `@react-three/fiber` is a
  production ECS-over-three.js reconciler whose host config is exactly this
  surface: `createInstance` → `appendChild` → `removeChild` → `applyProps`
  (`packages/fiber/src/core/reconciler.tsx`).
- **Recall, NOT verified this pass:** Bevy's render-world "extract" step (build
  a derived scene from ECS components each frame). Cited as context only; drop
  it from the README rather than assert it unverified.

## Decision record

**Decision.** Ship `src/modules/render-scene3d/` as a backend-agnostic
reconciler implementing the core `Renderer<TCtx>` contract, generic over
`TObject`, with the consumer supplying the scene-graph adapter, the object
factory and an optional per-frame `sync`. Adopt it in all four 3D examples in
this commit.

**Options considered.**

1. *Do nothing; keep the four copies.* Rejected. The bookkeeping loop is
   duplicated roughly sixteen times and the local contract four times; every
   copy is a place to forget the reap pass and leak objects on scene teardown.
2. *Ship `render-threejs` importing `three`.* Rejected. It would add a `three`
   dependency to the engine's `package.json`, breaking "pay for what you use"
   and the tree-shakeable-module invariant, and it pins one vendor into an
   engine surface. Canon here is not one library anyway — it is a scene-graph
   shape.
3. *Ship a `Renderable3D` component model plus an interpreter* (the literal
   `RenderableDef` + `Canvas2DRenderer` analogue). Rejected. three.js already
   owns the drawable model (mesh / material / geometry / lights), so an engine
   model would be a lossy duplicate — and it would fight `transform-3d`'s
   existing pose components, which already own `position` / `rotation` / `scale`.
   The examples' `create` steps read game components, so the mapping is
   irreducibly consumer-side.
4. **Chosen:** the reconciler alone, generic over `TObject`.

**Boundaries drawn deliberately.**

- **`domElement`, `resize` and GL-context `dispose` stay in the consumer.** They
  are surface and lifetime, not the render pass:
  - `domElement` is not a property of "a renderer" — renderers compose (an array
    drawing into one canvas, `src/renderer.ts`), and only the GL-context owner
    has a canvas. It is also the input/hit-test surface
    (`starfighter/main.ts:128-131` reads `getBoundingClientRect()` on it).
  - `resize` has a single consumer of four. doom, platformer-3d and portal use
    a fixed `WIDTH`/`HEIGHT` and register no listener; only starfighter wires
    `window.addEventListener('resize', …)`, and its handler interleaves app
    relayout (`ringRadius` / `layoutRing()`, `starfighter/main.ts:150-158`).
  - Core puts a lifetime method on a contract only where **every**
    implementation needs it — `InputProvider.dispose` (every impl binds
    listeners), `AudioProvider.dispose` (every impl owns nodes),
    `TickSource.start/stop` (every impl owns a loop). `Canvas2DRenderer` and
    `DomRenderer` own nothing to release, so `dispose` on `Renderer<TCtx>` would
    be a forced no-op.
  - If a shared surface/lifetime shape ever emerges it belongs to the
    speculative app-host mount/teardown helper, not to a renderer.
- **`dispose(graph)` frees only what the renderer created.** It removes the
  tracked objects from the graph and clears its map. The authored geometry,
  materials and textures stay the consumer's: every example disposes its own
  before dropping the GL context (`doom/render.ts:314` `unitBox.dispose()`,
  `platformer-3d/render.ts:140`, `starfighter/render.ts:229-235`,
  `portal/render.ts:673-678`).
- **No camera.** Positioning the camera is `modules/camera-3d`, its own ready
  entry. Each example keeps the camera rig it has.
- **No z-order analogue of `RenderOrderDef`.** three.js has `renderOrder` on the
  object; a consumer that wants it sets it in `sync`.
- **Not `modules/render-webgl` / `render-webgpu`.** Those are the "the engine
  draws 3D itself" entries, still deferred behind "three.js covers 3D today".
  This module makes that deferral *more* comfortable: it standardises how any
  scene-graph backend is driven, so a future first-party WebGL backend slots in
  behind the same reconciler.

## API

```ts
// scene-graph.ts — the consumer's adapter over whatever scene graph it uses
interface SceneGraph<TObject> {
  add: (object: TObject, entityId: EntityId) => void;
  remove: (object: TObject, entityId: EntityId) => void;
}

// render-scene3d.ts
interface Scene3DRenderContext<TObject> {
  graph: SceneGraph<TObject>;
  world: EcsWorld;
}

interface Scene3DRendererOptions<TObject> {
  /** Which entities this pass draws: a tag or a component store. */
  from: TagDef | ComponentDef<unknown>;
  /** Called once per entity, on first sight. */
  create: (entityId: EntityId, world: EcsWorld) => TObject;
  /** Called every frame after `create`; the reconciler owns existence, not content. */
  sync?: (object: TObject, entityId: EntityId, world: EcsWorld) => void;
}

class Scene3DRenderer<TObject> implements Renderer<Scene3DRenderContext<TObject>> {
  constructor(options: Scene3DRendererOptions<TObject>);
  render(ctx: Scene3DRenderContext<TObject>): void;
  /** Remove every tracked object from `graph` and clear the map. */
  dispose: (graph: SceneGraph<TObject>) => void;
}

// pose3d.ts — the pose copy every consumer hand-writes
interface PoseTarget {
  position: { x: number; y: number; z: number };
  quaternion?: { w: number; x: number; y: number; z: number };
  scale?: { x: number; y: number; z: number };
}
interface Pose3D { position: Vec3; rotation?: Quat; scale?: Scale3D }

/** Most recent value wins; absent optional fields are left untouched. */
applyPose3D(target: PoseTarget, pose: Pose3D): void
/** Read `Position3DDef` + optional `Rotation3DDef` / `Scale3DDef` for one entity. */
poseOf(world: EcsWorld, entityId: EntityId): Pose3D | null
```

`THREE.Object3D` — and therefore `Mesh` and `Sprite` — satisfies `PoseTarget`
structurally (`position` / `quaternion` / `scale`, all `{x, y, z}` / `{w, x, y, z}`),
so the consumer passes a three.js object straight through with no adapter.

One instance per object class, composed by the array-of-renderers pattern core
already documents: doom wires four (`static`, `sprite`, `projectile`,
`pickup`), platformer-3d three, each replacing a hand-rolled ~20-line function.

`from` accepts a tag **or** a component store. Every current consumer uses a
tag; the store form is included because the two shipped sibling renderers are
store-driven (`Canvas2DRenderer` iterates `RenderableDef`, `DomRenderer`
iterates `DomRenderableDef`) and the branch is a few lines. It is the one
surface in this API without a consumer today.

## Tasks

- [ ] `src/modules/render-scene3d/scene-graph.ts` — `SceneGraph<TObject>`.
- [ ] `src/modules/render-scene3d/render-scene3d.ts` — `Scene3DRenderer<TObject>`,
      `Scene3DRenderContext`, `Scene3DRendererOptions`.
- [ ] `src/modules/render-scene3d/pose3d.ts` — `PoseTarget`, `Pose3D`,
      `applyPose3D`, `poseOf`.
- [ ] `src/modules/render-scene3d/index.ts` — barrel.
- [ ] `src/modules/render-scene3d/render-scene3d.test.ts` — a fake object
      (`{position, quaternion, scale}`) proving: create once across two frames;
      `sync` runs every frame; tag removal reaps from the graph and the map;
      re-add creates a fresh object; a member missing `Position3D` is skipped
      without throwing; `dispose(graph)` empties graph and map; both `from`
      forms iterate identically.
- [ ] `src/modules/render-scene3d/README.md` — API, the reconciler-vs-surface
      boundary, "not included (by design)", canon (verified sources only). Must
      document the `modules/transform-3d` sibling edge (architecture rule 3) and
      keep its code sample type-checkable (`scripts/doc-samples.test.ts`).
- [ ] Adopt in doom — four `Scene3DRenderer` instances replacing
      `meshes`/`enemySprites`/`projMeshes`/`pickupMeshes`; keep the tracer
      singleton, the camera rig and `domElement`/`resize` in `main.ts`.
- [ ] Adopt in portal — same lift; keep the render-target / virtual-camera work
      in the example (that is the separate `modules/render-target` entry).
- [ ] Adopt in platformer-3d — three instances replacing `ensureMesh` /
      `syncFromTag` / `reapUntouched`.
- [ ] Adopt in starfighter — same lift; keep its resize handler and app relayout.
- [ ] `scripts/manual.ts` — add `render-scene3d` to the "Presentation and
      assets" category, exactly once (`scripts/manual.test.ts` enforces this).
- [ ] `npm run docs:api` and `npm run docs:usage` — regenerate the two generated
      catalogs (both are drift-guarded by `npm test`).
- [ ] `docs/roadmap/ecs-module-backlog.md` — delete the `modules/render-scene3d`
      entry and its status-table row; shipped work does not live in the backlog.
- [ ] Move this plan to `docs/plans/done/` in the same commit.

No `package.json` change is needed: `"./modules/*": "./src/modules/*/index.ts"`
already publishes the subpath.

## What this deliberately leaves open

- **A first-party 3D backend.** Covered by the deferred `render-webgl` /
  `render-webgpu` entries; this module neither needs nor blocks them.
- **Scene-object *creation* policy.** The module never decides that an entity
  becomes a box or a sprite. If a future consumer wants a data-driven
  `Renderable3D`, that is a new shape with its own evidence bar — this module's
  `create` hook is where it would plug in.
- **A shared surface/lifetime helper.** No shape yet: one of four consumers is
  responsive, and its resize handler is welded to app relayout.
