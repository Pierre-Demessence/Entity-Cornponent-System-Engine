# Plan — `modules/collision` V2: ray vs AABB

Ship the ray/AABB narrowphase query. Backlog entry: `modules/collision` V2
(deferred, trigger **MET** — two consumers hand-roll the same function).

## Dual-sided verification (2026-09-22)

**Engine — ABSENT.** `src/modules/collision/narrowphase.ts` ships
`aabbVsAabb`, `aabbVsCircle`, `circleVsCircle`, `aabbVsAabbSwept`,
`bounceOffAabb` and `reflect`. No ray query of any kind.

**Consumers — three, in two dimensions.**

- **stealth-guard** `src/vision.ts:10-40` hand-rolls a **Liang–Barsky
  segment-vs-AABB** (`segmentHitsRect`) to answer "does a wall block the line
  from guard to player" (`hasLineOfSight`@`vision.ts:43`). 2D, top-left anchored
  `Wall {x,y,w,h}` — the same anchor convention as `Aabb`.
- **portal** `systems/portal-math.ts:63` and **doom** `systems/math.ts:18` are a
  byte-identical **slab-method ray-vs-AABB** over `Vec3`, returning
  `RayHit { axis: 'x'|'y'|'z'; t }`. Used for portal placement, carry wall-clamp,
  hitscan (`weapon.ts:80,96`) and enemy line-of-sight (`ai.ts:118`).

**The dimension split, stated plainly.** The module is 2D (`Vec2`, `Aabb` with
top-left anchor, `ShapeAabb {w,h}`); the portal/doom copies are 3D over `Vec3`,
with centre/half-extent arguments. Per the 2D-vs-3D strategy in the backlog, a
3D sibling (`modules/collision-3d`) ships with the 3D group, not as an extension
of this module. So this slice covers the **2D** case, which has a real consumer
(stealth-guard) plus canon, and the 3D copies stay duplicated until that group
lands — recorded in the backlog's 3D tally, not silently.

Citation note: the `vision.ts` line numbers above are the file as it was before
this change, which rewrites it (`segmentHitsRect` is deleted), and the push-out
refs are `systems.ts:161-176`.

## Decision record

**Decision.** Add `rayVsAabb(origin, dir, box)` to `narrowphase.ts` — one
function, returning the entry `t` and the entry-face axis, `null` on a miss.

**Options considered.**

1. *A `hitFromInside` option* (Godot's `hit_from_inside`, Unity's
   `queriesStartInColliders`) so a ray starting inside the box reports a hit.
   Rejected: stealth-guard's "origin inside a wall" case — the only place the
   distinction is observable — is already handled by the containment test that
   Liang–Barsky effectively performs, and it composes from shipped primitives
   (`aabbVsAabb` with a zero-size box). A flag on the hot path to serve one
   caller that can express it in one line is worse than the line.
2. *Two functions — `rayVsAabb` and `segmentVsAabb`.* Rejected: `t` is
   parametric in units of `dir`, so a caller who passes the segment vector
   (`to - from`) gets `t ≤ 1` for free. One function, two call shapes.
3. **Chosen:** the single slab query, matching the shape the two 3D consumers
   already use (`t` + face axis), so the 3D sibling is a port rather than a
   redesign — modulo two documented differences: the copies break corner ties
   toward `x` (this prefers `y`, matching the module's other helpers) and use a
   small tolerance rather than an exact zero test.

**`t` semantics (load-bearing).** `t` is in units of `dir`, not world distance:
pass a unit vector to get a distance, or the segment vector to get a fraction.
The 3D copies assume unit-length in their docblock; this one does not need to.
Porting between dimensions is therefore a rename **plus a thin adaptor** — the
signatures differ in kind (corner + `w/h` here, centre + half-extents there) and
`axis` gains a `z`.
**Zero-entry rule.** `null` when the entry is not strictly positive — a miss, a
box entirely behind, or an origin on or inside the surface. That is *close to*
the 3D copies' behaviour, which reject `tmin <= 1e-4` with a `1e-8`
near-parallel band rather than an exact zero test. The one behavioural difference
from stealth-guard's Liang–Barsky is an origin lying anywhere on the box's
**closed boundary** — any face, edge or corner, including the `from === to` case
there and an on-boundary origin pointing away. Liang–Barsky counts `t0 = 0` as
blocked; this counts it as a miss. Unreachable via that game's systems, because
movers are pushed out of walls with a non-zero radius (`systems.ts:161-176`), so
a centre never lands on a face coordinate — and `guardSeesPlayer` reads
post-push positions, since it runs before `motion` pushes them out again. A
hand-authored spawn sitting exactly on a wall face would still expose it.

## API

```ts
type AabbAxis = 'x' | 'y';
interface RayHit { readonly axis: AabbAxis; readonly t: number }

function rayVsAabb(origin: Vec2, dir: Vec2, box: Aabb): RayHit | null;
```

## Tasks

- [x] `src/modules/collision/narrowphase.ts` — `rayVsAabb`, `RayHit`, `AabbAxis`.
- [x] `src/modules/collision/index.ts` — export the three symbols.
- [x] `src/modules/collision/narrowphase.test.ts` — hit/miss, entry axis, `t`
      semantics for unit vs segment vectors, grazing the edge, diagonal entry,
      origin inside/behind, parallel-to-face, zero direction.
- [x] `src/modules/collision/README.md` — helper list + semantics.
- [x] Migrate stealth-guard `src/vision.ts` — delete `segmentHitsRect`, use
      `rayVsAabb` + the containment check.
- [x] `npm run docs:api`; backlog entry + trigger row removed; 3D group's tally
      keeps its ray row (still open); readiness note narrowed to 3D.
- [x] `npm test` + `npm run lint` clean; `tsc --noEmit` clean in stealth-guard.
- [x] Peer review to LGTM.

## Invariants

- Pure function, no allocations on the miss path, no ECS imports; the module's
  only cross-module dependency stays `clamp` from `modules/math`.
- `null` (not a sentinel object) for a miss — `rayVsAabb` has no natural
  "no hit" scalar to occupy a frozen sentinel the way `aabbVsAabbSwept` does.
- `t` is strictly positive on every hit; the returned `axis` names the face the
  ray **entered** through.

## Behaviour preservation

stealth-guard keeps its exact LoS semantics: "blocked" is now
`aabbVsAabb(degenerate box at the origin, wall) || rayVsAabb(origin, to - origin, wall)?.t <= 1`.
Playtest-owned, so the example needs an eyeball before it counts as verified —
the guard's vision cone is directly observable in that game.

## Review outcome (2026-09-22)

Pass one found no correctness blocker and verdicted the stealth-guard migration
PRESERVED, with one disclosed, effectively-unreachable divergence (an origin
lying on the box's closed boundary: blocked before, a miss now). Four
non-blocking items — three bullets below, one of them covering both test gaps —
all fixed:

- A stale readiness row still listed `ray-vs-AABB` as a missing Hollow-Knight
  item. The 2D case now ships, so that row is slopes + one-way platforms only.
- Two real test gaps, both raised by pass one: the `y`-axis near/far swap was
  unpinned (nothing exercised a negative `dir.y`), and no case produced
  `tEnter === tExit`, leaving the corner-graze comparison unpinned. Both are now
  covered.
- Plan prose that overreached: "the same rule" as the 3D copies (they reject
  `tmin <= 1e-4` with a `1e-8` near-parallel band), "a ray starting exactly on a
  face" (it is any point on the closed boundary, including a zero-length segment
  there), and "a port rather than a redesign" (the copies break corner ties
  toward `x`; this prefers `y`, matching the module's other helpers). All three
  now say what the code does.

Nits applied: the along-a-face test's name claimed the returned axis was the
grazed face, the zero-length test only ever reached the parallel pre-filter
rather than the no-entry-time path, and the slab swaps allocated two-element
arrays against the file header's no-allocation promise.

Pass two returned LGTM and confirmed the allocation-free rewrite is
behaviourally identical (`tEnter = max(min-axis)`, `tExit = min(max-axis)` for
every sign combination) and that the new tests pin the swap, the tangency and the
interior zero-direction path. It found one remaining **false** claim of ours —
"a ray running exactly along a face counts as a hit" fails when the origin is
already on that face, which is the boundary rule winning — now corrected in the
JSDoc and README and pinned by a test. Also corrected: the README's
point-inside pairing is not a full cover (`aabbVsAabb` is strict-interior, so an
origin exactly on the wall boundary is caught by neither half), "a port is a
rename" understated the signature differences, the file header now promises
"no allocation on the miss path" rather than "inside the hot path", and the
readiness paragraph no longer implies all four 3D examples duplicate both the
solver and the ray.
