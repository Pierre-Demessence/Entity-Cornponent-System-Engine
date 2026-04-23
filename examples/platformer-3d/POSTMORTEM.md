# 3D Platformer — Postmortem (Rung 7)

Rung 7 lands. A chase-cam 3D platformer with gravity, swept AABB
resolution on three axes, and coin pickups, rendered via three.js,
built on `@pierre/ecs` with **zero edits to the engine package**. That
was the one thing this prototype had to prove, and it did.

Roadmap doc:
[../../../../docs/roadmap/prototype-games-roadmap.md](../../../../docs/roadmap/prototype-games-roadmap.md).
Plan doc:
[../../../../docs/plans/platformer-3d-prototype.md](../../../../docs/plans/platformer-3d-prototype.md).

## What this prototype proved

- `@pierre/ecs` is **genuinely dimension-agnostic**. Every touched API
  (`EcsWorld`, `ComponentDef`, `TagDef`, `Scheduler`, `TickRunner`,
  `EventBus`, `simpleComponent`, `makeTriggerSystem`, `KeyboardProvider`,
  `createInput`, `FixedIntervalTickSource`, `AnimationFrameTickSource`)
  worked unchanged with `{x, y, z}` positions and 3-extent AABBs.
- `simpleComponent` accepted 3-field schemas (`{x, y, z}`,
  `{vx, vy, vz}`, `{w, h, d}`) the same way it accepts 2-field ones.
  There's nothing 2D about it.
- `makeTriggerSystem` didn't care that the overlap check was
  3-axis — it just takes `broadphase`/`overlaps`/`onOverlap`
  callbacks and runs them.
- The `Scheduler`/`TickRunner` decoupling meant the logic tick
  (60 Hz, fixed) and the render tick (rAF, variable) could drive
  totally different subsystems — ECS for the world, three.js for the
  frame — without any hand-holding.

## What was awkward

- **Implicit Rule Against Shared 2D Components.** `PositionDef`,
  `VelocityDef`, `ShapeAabbDef`, `GroundedDef` in the engine's
  `transform`/`collision`/`kinematics` modules are all 2D-shaped. A 3D
  example **cannot** reuse them — not because of an enforced contract
  but because `{x, y}` would silently mismatch a 3D renderer, and
  `GroundedDef` ships from the 2D `kinematics` module. The example
  redefines all four locally and that's fine for a prototype, but if a
  second 3D consumer ever appears, `modules/transform3d` +
  `modules/kinematics3d` are the logical home.
- **`Grounded` is in `modules/kinematics`, not
  `modules/transform`.** Because the engine's `Grounded` is exported
  from the 2D kinematics module, a 3D example either redefines it
  (what we did) or imports a 2D-physics-coded component that happens
  to look the same shape. If `Grounded` is truly dimension-neutral
  (it's a `boolean`), it probably belongs in a shared location; if
  it's 2D-kinematics-specific, the current location is right. Flag
  for a future look, not a blocker.
- **No engine 3D spatial structure.** `HashGrid2D` exists; nothing
  corresponds in 3D. Brute-forcing ~7 statics in the example is fine,
  but Rung 4's top-down shooter already leaned on `HashGrid2D` at
  scale, so the parity question is real. Deferred to the M1
  "SpatialStructure<TPos>" roadmap item — not escalated here.
- **Scene-graph-vs-ECS authority.** three.js has its own transform
  hierarchy (`Object3D.parent`, `.matrixWorld`). We chose ECS-as-truth,
  rebuild-on-render: every frame walk tags, mirror positions/scales
  into a pre-allocated `Mesh` per entity, reap meshes whose entity
  disappeared. This is O(n) per frame and trivially correct. An event-
  driven reconciler (react to `EntityDestroyed`, `ComponentChanged`)
  would be faster at scale but would duplicate three.js's own scene-graph
  traversal logic. Reconciliation-on-demand wins at this size.
- **`AnimationFrameTickSource` keeps ticking while the tab is
  hidden?** I didn't stress-test this. For a 3D scene that's
  expensive. A future `VisibilityPausingTickSource` wrapper would
  help but isn't a blocker.

## What was surprising

- The **Y-axis axis-order trick from the 2D kinematics module
  translated straight to 3D**: resolve X, then Z, then Y. If Y is
  resolved first, horizontal movement into a wall top cancels
  forward velocity before jumping even begins. Exact same gotcha,
  exact same fix, one more axis.
- **Camera yaw lives outside ECS.** Mouse drag mutates
  `state.cameraYaw` directly from DOM handlers in `main.ts`, not
  through a system. The input system then reads the scalar to build
  its camera-relative basis. This is fine and arguably cleaner than
  forcing a `PointerProvider` through the tick loop — continuous aim
  values don't need edge semantics. The card-battler example reached
  the same conclusion for drag-and-drop; that's two prototypes
  agreeing the "one-scalar-on-state" pattern is the right shape for
  analog-ish pointer input.
- **three.js playing nicely with vite workspaces** — `npm install` at
  the repo root picked up `three` via the example's `package.json`,
  the hub could `import('@pierre/ecs-example-platformer-3d/src/main.ts')`
  and three.js got code-split into the example's chunk. No
  configuration needed beyond the one package dependency.
- **The 508 KB bundle size** is almost entirely three.js. That's
  expected and documented in three.js's own docs. For a real app one
  would cherry-pick submodules (`three/webgpu`, manual imports), but
  for a prototype bundle-size is not the point.

## Engine changes required

**None.** `packages/ecs/src/` is byte-identical to its state before
this example landed. The example lives entirely in
`packages/ecs/examples/platformer-3d/`.

## LOC budget

Source lines (non-empty, non-comment) across `src/`:

| File | ~LOC |
|---|---|
| `components.ts` | ~35 |
| `game.ts` | ~100 |
| `systems/input.ts` | ~50 |
| `systems/kinematics3d.ts` | ~100 |
| `systems/pickup.ts` | ~55 |
| `systems/index.ts` | ~3 |
| `render.ts` | ~140 |
| `main.ts` | ~120 |
| **Total** | **~600** |

Well under the 1200-LOC roadmap budget. The headroom goes to three.js
scene setup and the custom 3D kinematics — both proportional to the
engine gap they cover.

## Follow-ups (not blocking)

- Consider promoting `Grounded` out of `modules/kinematics` if a
  second physics module ever appears.
- When/if a second 3D example is written, promote
  `Position3DDef`/`Velocity3DDef`/`ShapeAabb3DDef` into
  `modules/transform3d` and `modules/collision3d`. One consumer is
  a prototype; two consumers is a module.
- Audit `AnimationFrameTickSource` behavior under `visibilitychange`.
- A generic `SpatialStructure<TPos>` interface (roadmap M1) would let
  3D examples reach for a proper broadphase without reinventing the
  tagging glue.
