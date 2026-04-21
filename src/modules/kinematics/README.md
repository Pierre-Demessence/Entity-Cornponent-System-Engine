# `@pierre/ecs/modules/kinematics`

Arcade-style kinematic body resolution for platformers and other
gravity-driven 2D games.

This module combines the shapes from `modules/collision` with the
velocity integration of `modules/transform` into a single
`SchedulableSystem` that advances every dynamic body by one physics
tick: **gravity → X-axis resolve → Y-axis resolve → `onGround`
update**.

The design mirrors Phaser Arcade Physics and Godot `CharacterBody2D`:
penetration-based axis-separated push-out, not a full rigid-body
simulation. For continuous-sweep collision avoidance see
`aabbVsAabbSwept` in `modules/collision`.

## Components

### `GroundedDef`

```ts
interface Grounded { onGround: boolean }
```

Per-entity ground-contact flag. Kinematic resolution sets
`onGround = true` when the body lands on a static during a downward
sweep; the flag is cleared at the start of each vertical move (so a
consumer can read it after the system runs to implement jump /
coyote-time logic).

A body participates in kinematic simulation **if and only if** it
has all four components: `Position`, `Velocity`, `ShapeAabb`, and
`Grounded`. Static obstacles need only `Position`, `ShapeAabb`, and
the tag you pass as `staticTag`.

## `makeKinematicsSystem<TCtx>(options)`

Factory that returns a `SchedulableSystem<TCtx>` covering the whole
pipeline. All options:

| Option | Type | Purpose |
| --- | --- | --- |
| `gravity` | `number` | Downward acceleration (units/sec²). |
| `terminalVelocity` | `number` | Upper clamp applied to `vy` after gravity. If `vy` already exceeds `terminalVelocity` entering the tick (e.g. from a scripted knockback), it is clamped down the same tick. Upward velocity (`vy < 0`) is **not** clamped. |
| `broadphase` | `(ctx, x, y, w, h) => Iterable<EntityId>` | Candidate static ids overlapping the target AABB. |
| `staticTag` | `TagDef` | Tag that identifies immovable obstacles. Non-tagged ids returned by `broadphase` are ignored. |
| `name?` | `string` | Scheduler name. Defaults to `'kinematics'`. |
| `phase?` / `runAfter?` / `runBefore?` | — | Standard scheduler hooks. |

### Broadphase contract

`broadphase` is called **up to twice per moving body per tick** —
once for the X-axis projected target AABB, once for the Y-axis. It
is skipped for whichever axis has zero velocity. Over-yielding is
safe (the system re-tests each candidate with `aabbVsAabb` and
filters by `staticTag`), so a spatial-grid query on cells touching
the AABB is the expected shape:

```ts
makeKinematicsSystem<GameState>({
  broadphase: (ctx, x, y, w, h) => {
    const out = new Set<EntityId>();
    for (const c of cellsForAabb(x, y, w, h)) {
      const ids = ctx.grid.getAt(c.x, c.y);
      if (ids) for (const id of ids) out.add(id);
    }
    return out;
  },
  gravity: 1200,
  staticTag: StaticBodyTag,
  terminalVelocity: 900,
});
```

The system never asks the broadphase to yield dynamic-vs-dynamic
pairs — those belong in a `makeTriggerSystem` built on top of the
same spatial index.

### Resolution semantics

For each axis the system:

1. Computes the naive target position (`pos + vel * dt`).
2. Walks every broadphase candidate. If the candidate carries
   `staticTag` and its AABB overlaps the target, the body is snapped
   to the nearest non-penetrating edge and the corresponding velocity
   component is zeroed.
3. On the Y axis, a downward collision additionally sets
   `onGround = true`.

Because resolution is penetration-based, very high velocities or very
thin obstacles can still tunnel. When that matters, use the swept
helper from `modules/collision` directly and skip this system.

## Scheduler placement

Typical ordering in a per-frame scheduler:

```text
input  →  kinematics  →  trigger (pickups, damage)  →  render
```

`runAfter: ['input']` is the usual constraint — input mutates
velocity, kinematics integrates it. Put any gameplay triggers that
depend on post-resolution positions **after** kinematics.

## Dependencies

- `modules/transform` — `Position`, `Velocity`.
- `modules/collision` — `ShapeAabb`, `aabbVsAabb`.
- Host game — the `broadphase` closure (typically backed by
  `modules/spatial`) and the `staticTag`.
