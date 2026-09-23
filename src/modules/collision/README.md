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
  `aabbVsCircle`, `rayVsAabb`) so every game is not rewriting the same
  formulas.
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
rayVsAabb(origin: Vec2, dir: Vec2, box: Aabb): RayHit | null   // { axis: 'x'|'y', t }
```

- `aabbVsAabb` uses strict inequality — edge contact does **not**
  count as overlap.
- `circleVsCircle` and `aabbVsCircle` use `≤` — touching counts as
  overlap.
- `aabbVsAabbSwept` returns `{ hit, tEntry, normal }`. `tEntry ∈ [0,1]`
  is the fraction of `motionA` at first contact; `normal` is the unit
  vector on `b`'s surface at contact.
- `aabbVsCircle` clamps the circle centre onto the box with `clamp`
  from [`modules/math`](../math/README.md) — the module's only
  cross-module source dependency.
- `rayVsAabb` returns the entry `t` (strictly positive) and the `axis`
  of the face it enters through, or `null` when the ray misses, the box
  lies entirely behind the origin, or the origin is on or inside the box.

### Ray semantics

`t` is parametric in **units of `dir`**, which is what lets one function
serve both ray shapes:

- Pass a **unit** vector → `t` is a world distance (hitscan, picking).
- Pass the **segment** vector `to - from` → `t` is the fraction along the
  segment, so `t <= 1` answers "does the segment cross the box?"
  (line-of-sight against walls). An origin already *inside* the box is a
  `null`, so pair this with the point-inside check below when an inside
  origin must count as blocked. The pair is not quite a cover:
  `aabbVsAabb` is a **strict-interior** test, so an origin sitting exactly
  on the wall's boundary is caught by neither half.

A zero-length `dir` never hits. A ray travelling exactly along a face
counts as a hit once it enters that face's span from outside — boxes are
closed, which is the conservative answer for sight — and so does a corner
graze where entry and exit land on the same `t`. (An origin already on
that face is still a miss; see the boundary rule below.) The returned
`axis` is the face the ray **enters** through, which need not be the face
it grazes. When two axes enter at the same `t` (an exact corner), the `y`
face wins, consistent with `aabbVsAabbSwept` and `bounceOffAabb` — note
that the 3D copies in `examples/portal` and `examples/doom` break that tie
the other way.

For "is this point already inside a box?" — which `rayVsAabb` answers
`null` — compose `aabbVsAabb` with a zero-size box at the point, rather
than paying for a flag on this path.

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
- No physics response (see the shipped `modules/kinematics`; full rigid-body
  physics is tracked as deferred in the module backlog).
- No layer/mask filtering (do it in `broadphase` or `overlaps`).
- No continuous circle or OBB collision.
