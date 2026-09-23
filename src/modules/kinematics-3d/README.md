# `@pierre/ecs/modules/kinematics-3d`

Arcade-style kinematic body resolution in 3D — the parallel sibling of
[`modules/kinematics`](../kinematics/README.md), not an extension of it.

The module combines a position + velocity pair with the box shape from
[`modules/collision-3d`](../collision-3d/README.md) into one `SchedulableSystem`
that advances every dynamic body by one physics tick:

```text
gravity  →  X-axis resolve  →  Z-axis resolve  →  Y-axis resolve  →  onGround
```

Like its 2D sibling this is **penetration-based axis-separated push-out**, not a
rigid-body simulation. The design mirrors Unity's `CharacterController` and
Godot's `CharacterBody3D`: a body is moved, then pushed out of whatever it ended
up inside.

Horizontal axes run before Y so a wall contact on the same tick cannot cancel a
jump. For continuous-sweep avoidance see `aabb3VsAabb3Swept` in
`modules/collision-3d`.

## Components

### `Grounded3Def`

```ts
interface Grounded3 { onGround: boolean }   // 'grounded3d'
```

Per-entity ground-contact flag. Resolution sets `onGround = true` when the body
lands on a static during the Y sweep, and clears it at the start of every tick —
so a consumer reads it *after* the system runs to implement jump / coyote-time
logic.

It is **optional on a body**, which is the one contract difference from the 2D
sibling:

- **with `Grounded3`** — the body reports ground contact and is eligible for
  step-up;
- **without it** — the body is still fully simulated (gravity + axis
  resolution), it just reports nothing. That is how one game runs player-like
  bodies and free-moving bodies (doom's enemies) through the same system.

A body participates **if and only if** it carries `dynamicTag`, `positionDef`,
`velocityDef` and `ShapeAabb3Def`. Statics need `positionDef`, `ShapeAabb3Def`
and to be yielded by the broadphase.

The world must still register `Grounded3Def`: the system reads that store every
tick whether or not any body uses it (`getStore` throws for an unregistered
component).

A body whose position the game *assigns* every tick — a cube pinned in front of
the camera — must **drop `dynamicTag`** while it is driven and get it back on
release: that is the only switch the system has, and portal's cube does exactly
that on grab. A body a moving collider merely carries along keeps its tag —
doom's elevator nudges the player's `y`, and the player stays simulated.

## `makeKinematics3DSystem<TCtx>(options)`

Factory returning a `SchedulableSystem<TCtx>` covering the whole pipeline.

| Option | Type | Purpose |
| --- | --- | --- |
| `gravity` | `number` | Downward acceleration (units/sec²), applied as `-y`. |
| `terminalVelocity` | `number` | Cap on downward speed (`-vy`). A body already faster than this entering the tick is clamped the same tick. Upward velocity is **not** clamped. |
| `dynamicTag` | `TagDef` | Marks the bodies the system simulates. |
| `staticTag` | `TagDef?` | Marks immovable obstacles. When supplied, candidates not carrying it are ignored — what makes over-yielding safe. Omit when the broadphase already yields exactly the colliders. |
| `positionDef` | `ComponentDef<{x,y,z}>` | Position component to integrate. |
| `velocityDef` | `ComponentDef<{vx,vy,vz}>` | Velocity component to integrate. |
| `stepHeight` | `number?` | Opt-in: the tallest rise a grounded body auto-climbs. Omit to disable step-up. |
| `broadphase` | `(ctx, box) => Iterable<EntityId>` | Candidate static ids overlapping the axis-projected `Aabb3`. |
| `name?` | `string` | Scheduler name. Defaults to `'kinematics3d'`. |
| `phase?` / `runAfter?` / `runBefore?` | — | Standard scheduler hooks. |

`positionDef` / `velocityDef` are **injected** rather than imported because the
engine has no `modules/transform-3d` yet. The module therefore owns no transform
concept; it reads whatever component pair the game hands it. The same pattern as
`makeFollowCameraSystem({ positionDef })`. Nullary defaults land here once
`transform-3d` ships.

### Broadphase contract

`broadphase` is called **once per axis per body** — three calls — with that
axis' projected target box (`Aabb3`, centre + **half** extents), including for an
axis with zero velocity, because a body can need depenetrating without moving.
Over-yielding is safe when `staticTag` is supplied: the system re-tests every
candidate with `aabb3VsAabb3` and ignores any id that does not carry the tag, so
a spatial-index query over the cells the box touches is the expected shape.
Omit `staticTag` when the broadphase's yield *is* the collider set — every id it
returns is then treated as a collider, which is how a game adds a movable body
that still blocks (portal's resting cube, which carries no static tag).

The box is the **pre-step** box: a step-up happens mid-sweep, so a broadphase
whose query is cell-exact should index a margin, or it can under-yield a static
the body only reaches after climbing. Brute-forcing the static tag, as all three
consumers do, is immune.

```ts
makeKinematics3DSystem<GameState>({
  broadphase: (ctx, box) => {
    const out = new Set<EntityId>();
    for (const cell of ctx.grid.cellsFor(box)) {
      const ids = ctx.grid.getAt(cell);
      if (ids)
        for (const id of ids) out.add(id);
    }
    return out;
  },
  dynamicTag: DynamicBodyTag,
  gravity: 26,
  positionDef: Position3DDef,
  staticTag: StaticBodyTag,
  terminalVelocity: 45,
  velocityDef: Velocity3DDef,
});
```

The system never asks the broadphase for dynamic-vs-dynamic pairs — those belong
in `makeTriggerSystem` from the 2D `modules/collision`, which is
dimension-free.

### Resolution semantics

For each axis the system moves the body, then walks the broadphase candidates.
A candidate is resolved only when **this axis is the axis of shallowest
penetration** — the shortest way out, and the only direction that cannot tunnel.
The guard is always on, and it is a correctness fix rather than a preference:

- without it, a body overlapping a large thin wall is pushed out through the
  wall's **wide** face and tunnels through neighbouring geometry;
- without it, the floor a body is resting on blocks (and flings) its horizontal
  movement, because the floor's X/Z extent is far larger than its Y overlap.

On X and Z the body is pushed to the nearest non-penetrating face and that
velocity component is zeroed. On Y the push-out direction is chosen by centre
comparison — below the static is a ceiling, above it is a floor, which
additionally sets `onGround`. Y never step-ups.

### Step-up

Supplying `stepHeight` enables the classic character-controller "step offset":
a body that **was grounded last tick** and runs into a static whose top is within
`stepHeight` above its feet is lifted onto that step instead of being blocked.
That is what lets a player walk up stairs without jumping.

It is opt-in because it is a gameplay feature — whether a low ledge is a wall or
a step must not arrive in a game by accident.

Step-up places the body without checking headroom, exactly as the hand-rolled
resolvers it replaces did: a ceiling directly above the step is resolved by the
same tick's Y pass rather than blocking the climb.

## Dependencies

- [`modules/collision-3d`](../collision-3d/README.md) — `ShapeAabb3Def` and the
  `aabb3VsAabb3` narrowphase.
- [`modules/math-3d`](../math-3d/README.md) — the `Vec3` *type* only, naming the
  payload of the injected `positionDef` / `velocityDef`.
- The **host game** — `dynamicTag`, an optional `staticTag`, the `positionDef` /
  `velocityDef` pair, `gravity`, `stepHeight` and the `broadphase` closure.

## Not included (by design)

- **Slopes.** A non-axis-aligned surface needs a normal-aware resolver. This
  and one-way platforms are the `modules/kinematics-3d` V2 backlog entry,
  marked **ready** — the shape is canon (Godot
  `CharacterBody3D.floor_max_angle`, Unity `CharacterController.slopeLimit`), so
  they wait on a build slot, not on a consumer.
- **One-way platforms.** The same entry — a per-collider flag consulted in the
  sweep.
- **Moving-platform carry.** Doom hand-rolls it (`elevator.ts`) as the
  "moving-platform rider" shape; it belongs with `modules/attach`, not here.
- **A capsule collider.** Canon for a character controller, but the module
  resolves against box statics because that is what its consumers store. The
  capsule *shape and its narrowphase* are `modules/collision-3d`'s to add; this
  module adopts them when a game wants a capsule body.
- **A broadphase / spatial index.** Injected, exactly as in the 2D sibling.
