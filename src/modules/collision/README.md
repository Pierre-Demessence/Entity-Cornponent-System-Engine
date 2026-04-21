# `@pierre/ecs/modules/collision`

Shape components and domain-free collision helpers, plus a tiny
trigger-system factory that wires a broadphase + narrowphase into a
`SchedulableSystem`.

The module is intentionally minimal: it does **not** own any
broadphase acceleration structure, and it does **not** decide what
"overlap" means for your game — you supply both. What it does own:

- The data shapes (`ShapeAabbDef`, `ShapeCircleDef`) so multiple
  systems and consumers share a vocabulary.
- The math helpers (`aabbVsAabb`, `aabbVsAabbSwept`, `circleVsCircle`,
  `aabbVsCircle`) so every game is not rewriting the same formulas.
- The system glue (`makeTriggerSystem`) so overlap handlers have a
  consistent shape, schedulable identity, and obvious seam for swept
  queries / spatial indices.

## Components

### `ShapeAabbDef`

```ts
interface ShapeAabb { w: number; h: number }
```

Axis-aligned bounding box. Anchor is **top-left** at the entity's
`PositionDef.{x,y}`. Requires `PositionDef`.

### `ShapeCircleDef`

```ts
interface ShapeCircle { radius: number }
```

Circle. Anchor is **centre** at the entity's `PositionDef.{x,y}`.
Requires `PositionDef`.

## Narrowphase helpers

All helpers are pure functions with no ECS knowledge.

```ts
aabbVsAabb(a: Aabb, b: Aabb): boolean
aabbVsCircle(a: Aabb, c: Vec2, r: number): boolean
circleVsCircle(a: Vec2, ra: number, b: Vec2, rb: number): boolean
aabbVsAabbSwept(a: Aabb, motionA: Vec2, b: Aabb): SweptHit
```

- `aabbVsAabb` uses strict inequality — edge contact does **not**
  count as overlap.
- `circleVsCircle` and `aabbVsCircle` use `≤` — touching counts as
  overlap.
- `aabbVsAabbSwept` returns `{ hit, tEntry, normal }`. `tEntry ∈ [0,1]`
  is the fraction of `motionA` at first contact; `normal` is the unit
  vector on `b`'s surface at contact.

## Trigger system

`makeTriggerSystem<TCtx>(opts)` returns a `SchedulableSystem<TCtx>`:

```ts
makeTriggerSystem<Ctx>({
  broadphase: (ctx) => Iterable<[EntityId, EntityId]>,
  overlaps?:  (ctx, a, b) => boolean,
  onOverlap:  (ctx, a, b) => void,
  name?:      'trigger',
  phase?:     string,
  runAfter?:  readonly string[],
  runBefore?: readonly string[],
})
```

- `broadphase` yields the candidate pairs each tick. Typical patterns:
  - `tagA × tagB` (exhaustive for small sets).
  - `sourceId × spatialIndex.queryNear(cell, range)`.
  - A static list for one-off checks.
- `overlaps` is the narrowphase. Omit it when the broadphase already
  yields exact hits.
- `onOverlap` runs once per confirmed pair. Pair ordering follows the
  broadphase — the factory never reorders or de-duplicates.

**World-mutation tip.** If `onOverlap` despawns, tags it into another
set, etc., materialise the broadphase into an array first so the
iterator is not invalidated mid-loop. See `examples/platformer` for
the in-callback pattern.

If side effects need to cascade (spawn children, game-over, etc.),
accumulate into a buffer inside `onOverlap` and drain it *after*
`trigger.run(ctx)` in your outer system. See `examples/asteroids`
for this post-processing pattern.

## v1 scope / non-goals

- No broadphase acceleration structures (use
  `@pierre/ecs/spatial-structure` or your own grid).
- No physics response (see the planned M4 `kinematics` module).
- No layer/mask filtering (do it in `broadphase` or `overlaps`).
- No continuous circle or OBB collision.
