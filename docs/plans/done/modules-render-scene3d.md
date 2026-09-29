# Plan — `modules/render-scene3d`: entity ↔ scene-object reconciliation

The 3D sibling of `modules/render-canvas2d` and `modules/render-dom`, and the
last of the four hand-rolled 3D duplicates to lift. Backlog entry: the 3D
sibling table's `modules/render-scene3d` row — "Entity ↔ scene-object sync:
create / update / reap by tag — the 3D analogue of `Canvas2DRenderer`",
**ready**, gate "Scheduling — build slot", on the strength of four consumers.

## What the module is, and what it is not

**Is:** a reconciler. One scene object per entity, created when the entity
first matches a query, updated every frame, removed from the graph when it stops
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
- PRESENT and reused: `world.query(...)` → `QueryBuilder` (`src/query.ts`)
  already expresses "these components, with these tags, without those tags"
  and iterates `[EntityId, ...components]`. The reconciler selects through it
  rather than inventing a second filter vocabulary.

**Consumers — four examples, seven copies of the same loop.**

- **The skeleton.** `Map<EntityId, TObject>` + a `Set<EntityId>` of ids seen
  this frame + create-on-miss + reap-unseen (`scene.remove` + `delete`), then
  `clear()` the seen-set.
  - `examples/platformer-3d/src/render.ts:59-110` — `meshes`, `touched`,
    `ensureMesh`, `syncFromTag`, `reapUntouched`; one shared map across three
    tags.
  - `examples/doom/src/render.ts` — four copies: statics (`meshes`/`touched`,
    `:79-120`), enemy sprites (`enemySprites`, `:136-165`), projectiles
    (`projMeshes`, `:168-193`), pickups (`pickupMeshes`, `:197-225`).
  - `examples/portal/src/render.ts:521-560` — one shared map across four tags
    **with first-tag-wins priority** (`if (touched.has(id)) continue; // already
    drawn by a higher-priority tag`), called door → plate → cube → static
    (`:727-731`).
  - `examples/starfighter/src/render.ts:129-170` — one map across bullet +
    target tags.
- **Selection is always "a tag, plus a required component set".** Every loop
  reads `Position3DDef` **and** a shape component, and skips (hence reaps) an
  entity missing either: `ShapeAabb3DDef` in platformer-3d, portal, doom statics
  and enemies; `RadiusDef` in starfighter. Only doom's projectiles and pickups
  need `Position3DDef` alone.
- **Tags overlap.** Portal doors carry both `DoorTag` and `StaticBodyTag`
  (`examples/portal/src/game.ts:201-202`). A per-tag pass must be able to
  exclude tags, or a door gets two meshes.
- **The `create` step is consumer-specific.** `ensureMesh(id, kind)` chooses
  geometry and material per tag (platformer-3d:62-78); doom's pickup mesh reads
  a game component to pick its material (`pickupStore.get(id)?.kind` —
  doom:217-221). This is the 20% the module must not try to own.
- **The pose copy is position-only.** Every loop does
  `obj.position.set(p.x, p.y, p.z)`; scale comes from the shape component
  (`ShapeAabb3D` / `Radius`) and rotation is a per-frame spin
  (`mesh.rotation.y += …`). No example uses `Rotation3DDef` or `Scale3DDef`.
- **Entity ids are reused.** `world.clearAll()` and `world.loadJSON` rewind
  `nextId` (`src/world.ts:147`, `:348`); doom's statics comment
  (`doom/render.ts:96-97`) relies on it. A create-once reconciler keyed on
  `EntityId` must be told when the world was reset.
- **`Renderer3D` is declared four times** (`doom/render.ts:16`,
  `platformer-3d/render.ts:16`, `portal/render.ts:31`,
  `starfighter/render.ts:17`). It stays consumer-side (see boundaries below);
  it is cited to explain where the reconciler's edge is, not as surface to lift.
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
`TObject` and the selected row shape. The consumer supplies the scene graph, a
`select` query, the object factory and an optional per-frame `sync`. Adopt it in
all four 3D examples in this commit.

**Options considered.**

1. *Do nothing; keep the seven copies.* Rejected. Every copy is a place to
   forget the reap pass and leak objects on scene teardown.
2. *Ship `render-threejs` importing `three`.* Rejected. It would add a `three`
   dependency to the engine's `package.json`, breaking "pay for what you use"
   and the tree-shakeable-module invariant, and it pins one vendor into an
   engine surface. Canon here is not one library anyway — it is a scene-graph
   shape.
3. *Ship a `Renderable3D` component model plus an interpreter* (the literal
   `RenderableDef` + `Canvas2DRenderer` analogue). Rejected. three.js already
   owns the drawable model (mesh / material / geometry / lights), so an engine
   model would be a lossy duplicate — and it would fight `transform-3d`'s
   existing pose components. The examples' `create` steps read game components,
   so the mapping is irreducibly consumer-side.
4. *Select with `from: TagDef | ComponentDef`.* Rejected. `TagDef` is
   `{ name }`, so every `ComponentDef` is assignable to it and the union cannot
   be discriminated at compile time; it also cannot require a second component
   (every consumer needs one) or exclude a tag (portal needs it).
5. **Chosen:** the reconciler alone, selecting through a core query.

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
  before dropping the GL context (`doom/render.ts:312` `unitBox.dispose()`,
  `platformer-3d/render.ts:140`, `starfighter/render.ts:229-235`,
  `portal/render.ts:673-678`).
- **World reset is the consumer's signal to send.** After `world.clearAll()` or
  `world.loadJSON(...)`, ids restart and the renderer cannot tell a reused id from
  a surviving entity. The documented rule: call `dispose(graph)` after resetting
  the world; the next `render` recreates everything.
- **No pose helper.** The only pose copy the examples perform is
  `position.set(x, y, z)`, which three.js already provides; rotation and scale
  are consumer-driven (shape components, spins). A `Rotation3D` / `Scale3D`
  → object copier waits for a consumer that stores those components. Without
  it the module reads no component itself and has no `transform-3d` edge.
- **No camera.** Positioning the camera is `modules/camera-3d`, its own ready
  entry. Each example keeps the camera rig it has.
- **No z-order analogue of `RenderOrderDef`.** three.js has `renderOrder` on the
  object; a consumer that wants it sets it in `sync`.
- **Not `modules/render-webgl` / `render-webgpu`.** Those are the "the engine
  draws 3D itself" entries, still deferred behind "three.js covers 3D today".
  This module standardises how any scene-graph backend is driven, so a future
  first-party WebGL backend slots in behind the same reconciler.

## API

```ts
// scene-graph.ts — the minimal surface of any scene graph
interface SceneGraph<TObject> {
  add: (object: TObject) => void;
  remove: (object: TObject) => void;
}

// render-scene3d.ts
interface Scene3DRenderContext<TObject> {
  graph: SceneGraph<TObject>;
  world: EcsWorld;
}

interface Scene3DRendererOptions<TObject, TRow extends unknown[]> {
  /**
   * The entities this pass draws, re-evaluated every frame — typically
   * `world.query(...)` with `.withTag(...)` / `.without(...)`. An entity
   * absent from the result is reaped.
   */
  select: (world: EcsWorld) => Iterable<Scene3DEntry<TRow>>;
  /** Called once per entity, on first sight. */
  create: (entry: Scene3DEntry<TRow>, world: EcsWorld) => TObject;
  /** Called every frame, including the creation frame, after `create`. */
  sync?: (object: TObject, entry: Scene3DEntry<TRow>, world: EcsWorld) => void;
}

type Scene3DEntry<TRow extends unknown[]> = [EntityId, ...TRow];

class Scene3DRenderer<TObject, TRow extends unknown[] = unknown[]>
  implements Renderer<Scene3DRenderContext<TObject>> {
  constructor(options: Scene3DRendererOptions<TObject, TRow>);
  render(ctx: Scene3DRenderContext<TObject>): void;
  /** The object held for an entity after the last `render`. */
  get(entityId: EntityId): TObject | undefined;
  /** Remove every tracked object from `graph` and forget it. Call after a world reset. */
  dispose(graph: SceneGraph<TObject>): void;
}
```

`SceneGraph.add` / `remove` take the object alone, so a `THREE.Scene` (or any
`Object3D` parent) satisfies `SceneGraph<THREE.Object3D>` structurally and is
passed straight in as `graph` with no adapter. A consumer that wants the entity
id on the object sets `object.userData` in `create`.

`TRow` is inferred from `select`, so `create` / `sync` receive the query's
component values typed — the examples' `posStore.get(id)` / `aabbStore.get(id)`
lookups disappear. The callbacks take the whole `[id, ...values]` entry the
query yielded, destructured the way a `for (const [id, p] of query)` loop
already is, so no row is copied per entity per frame.

`get(entityId)` exists because portal adjusts reconciled meshes after the pass
(hiding placeholder boxes once their loaded models arrive, and toggling the
cube's visibility per portal view).

One instance per object class, composed by the array-of-renderers pattern core
already documents. Portal's tag priority becomes explicit exclusion — the static
pass selects `.withTag(static).without(door, plate, cube)`:

```ts
const statics = new Scene3DRenderer({
  select: w => w.query(Position3DDef, ShapeAabb3DDef)
    .withTag(w.getTag(StaticBodyTag))
    .without(w.getTag(DoorTag), w.getTag(PlateTag), w.getTag(CubeTag)),
  create: () => new THREE.Mesh(unitBox, staticMat),
  sync: (mesh, [, p, a]) => {
    mesh.position.set(p.x, p.y, p.z);
    mesh.scale.set(a.w, a.h, a.d);
  },
});
```

## Tasks

- [x] `src/modules/render-scene3d/scene-graph.ts` — `SceneGraph<TObject>`.
- [x] `src/modules/render-scene3d/render-scene3d.ts` — `Scene3DRenderer`,
      `Scene3DRenderContext`, `Scene3DRendererOptions`.
- [x] `src/modules/render-scene3d/index.ts` — barrel.
- [x] `src/modules/render-scene3d/render-scene3d.test.ts` — a fake graph
      (records `add`/`remove`) and plain-object `TObject`, proving (also
      `get` after reap and re-entry):
  - [x] `create` runs once across two frames; `sync` runs every frame,
        including the creation frame, with the typed row.
  - [x] an entity leaving the query (tag removed, required component removed,
        excluded tag added, entity destroyed) is removed from the graph and
        forgotten; re-entering creates a fresh object.
  - [x] `.without(...)` exclusion: an entity carrying both an included and an
        excluded tag gets no object from that pass.
  - [x] `dispose(graph)` removes every tracked object; after `world.clearAll()`
        + `dispose` + re-spawn at the same id, `create` runs again.
  - [x] a `select` returning a plain array (not a `QueryBuilder`) works.
- [x] `src/modules/render-scene3d/README.md` — API, the reconciler-vs-surface
      boundary, the world-reset rule, "not included (by design)" (no pose
      helper, no camera, no surface/resize), verified canon only. State the
      module has no cross-module source dependency. Keep its code sample
      type-checkable (`scripts/doc-samples.test.ts`) — the sample cannot import
      `three`, so it uses a structural fake object.
- [x] Adopt in doom — four instances (statics, enemy sprites, projectiles,
      pickups) replacing `meshes`/`enemySprites`/`projMeshes`/`pickupMeshes`
      and their reap loops; `dispose` calls each instance's `dispose(scene)`.
      Keep the tracer, guns, camera rig and `domElement`/`resize` as they are.
- [x] Adopt in portal — four instances; the static pass excludes door, plate
      and cube tags so no entity gets two meshes. Keep the render-target /
      virtual-camera work, `cubeClone` and `playerBody` in the example (the
      render-target part is the separate `modules/render-target` entry).
- [x] Adopt in platformer-3d — three instances (player, static, coin) replacing
      `ensureMesh` / `syncFromTag` / `reapUntouched`; the coin spin stays in
      its `sync`.
- [x] Adopt in starfighter — two instances (bullet, target) replacing
      `ensureMesh` / `syncBodies` / `reapUntouched`; keep the ship, resize
      handler and app relayout.
- [x] Each example that resets its world (`clearAll`) calls its renderers'
      `dispose(scene)` on reset, or confirms by reading its reset path that the
      reconciled objects are id-independent (same `create` result for any id).
      All four are id-independent: platformer-3d, portal and starfighter pick
      the material per pass; doom now picks tint / sprite / pickup material in
      `sync`.
- [x] `scripts/manual.ts` — add `render-scene3d` to the "Presentation and
      assets" category, exactly once (`scripts/manual.test.ts` enforces this).
- [x] `npm run docs:api` and `npm run docs:usage` — regenerate the two generated
      catalogs (both are drift-guarded by `npm test`).
- [x] `docs/roadmap/ecs-module-backlog.md` — delete the `modules/render-scene3d`
      entry and its status-table row; shipped work does not live in the backlog.
      The pose copier is not tracked there; the module README's "Not
      included" section points callers to `sync` for `Rotation3D` / `Scale3D`.
- [x] Gate green: lint, typecheck, `npm test`, every example typechecks; each
      3D example smoke-run in a browser with no console errors.
- [x] `website/manual/getting-started/examples.md` — add `render-scene3d` to
      the four 3D examples' "Exercises" lists.
- [x] Move this plan to `docs/plans/done/` in the same commit.

No `package.json` change is needed: `"./modules/*": "./src/modules/*/index.ts"`
already publishes the subpath. `docs/audit/engine-readiness-assessment.md`
still lists entity↔mesh sync as missing; it is a dated audit and stays as
written.

## What this deliberately leaves open

- **A first-party 3D backend.** Covered by the deferred `render-webgl` /
  `render-webgpu` entries; this module neither needs nor blocks them.
- **Scene-object *creation* policy.** The module never decides that an entity
  becomes a box or a sprite. If a future consumer wants a data-driven
  `Renderable3D`, that is a new shape with its own evidence bar — this module's
  `create` hook is where it would plug in.
- **A pose copier (`Rotation3D` / `Scale3D` → object).** No consumer stores
  those components today; it lands with the first one that does.
- **A shared surface/lifetime helper.** No shape yet: one of four consumers is
  responsive, and its resize handler is welded to app relayout.
