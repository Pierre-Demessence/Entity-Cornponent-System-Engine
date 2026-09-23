# Plan — `modules/kinematics-3d`: arcade 3D character controller

Third slice of the 3D group, on top of the shipped `modules/math-3d` and
`modules/collision-3d`. Backlog entry: the 3D sibling table's
`modules/kinematics-3d` row ("Arcade 3D character controller — gravity +
axis-separated resolution against statics").

## Dual-sided verification

**Engine — PRESENT as a complete 2D sibling, ABSENT in 3D.**

`src/modules/kinematics/` is the template: `kinematics-system.ts`,
`grounded.ts`, `README.md`, and a colocated test file.

- `makeKinematicsSystem<TCtx>({ name?, gravity, terminalVelocity, staticTag,
  broadphase, phase?, runAfter?, runBefore? })` iterates every entity carrying
  position + velocity + box shape + `GroundedDef`, applies gravity (clamped to
  `terminalVelocity`), then resolves X, then Y, then updates `onGround`. The
  system is stateless; per-tick scratch lives on the stack.
- It takes its **narrowphase from `modules/collision`** (`aabbVsAabb`), its
  position/velocity from `modules/transform`, and its shape from
  `modules/collision/shape-aabb`. So its cross-module deps are already the
  layering pattern `kinematics-3d` repeats: core + math-3d + collision-3d.
- `broadphase(ctx, x, y, w, h)` yields candidate static ids and the system
  filters by `staticTag`, so over-yielding is safe.

**Consumers — three copies of the same resolver, and they DISAGREE.**

`resolveAxis` exists three times: `examples/{doom,portal,platformer-3d}/src/systems/kinematics3d.ts`.
All three read in full. The copies are **not** the same algorithm:

| | axis order | shallowest-penetration guard | step-up | consumer extras |
| --- | --- | --- | --- | --- |
| doom | x → z → y | **yes** | **yes** (`STEP_HEIGHT`, `tryStepUp`, `wasGrounded`) | — |
| portal | x → z → y | **yes** | no | a per-body collider set: the cube is one-way for the player, held bodies are skipped (§ below) |
| platformer-3d | x → z → y | **no** | no | — |

The guard appears in **two of the three**, in doom and portal, with a
near-verbatim comment explaining it. That is the strongest possible signal that
it is the engine's default rather than one game's opinion.

Axis order x → z → y is shared: horizontal axes first so vertical contact cannot
cancel a jump on the same tick, and all three do the centre-based overlap inline
(`halfW + shW - Math.abs(pos.x - sp.x)`) — which is now a call into
`modules/collision-3d`.

Portal's extras stay in portal: `carvedSurfaces` drops the wall a portal is
mounted on while the body is inside the opening, and the player additionally
collides with a *resting* cube (a held one is skipped). Both are consumer policy
that the injected `broadphase` must be able to express — it returns candidate
ids, so a game can filter and augment that list freely.

## Decision record

**Decision.** Ship `src/modules/kinematics-3d/` as the parallel sibling of
`modules/kinematics`, with two behaviours fixed by explicit decision:

1. **The shallowest-penetration guard is always on.** It is a correctness fix,
   not a preference: without it a body overlapping a large thin wall is pushed
   out through the wall's *wide* face and tunnels through neighbouring geometry,
   and a resting floor spuriously blocks horizontal movement. Doom's own comment
   says so. Adopting the module therefore **changes portal and platformer-3d
   behaviour** here — for the better, but it is a real change and gets a
   playtest.

2. **Step-up is opt-in.** Supplying a `stepHeight` enables it; omitting it
   disables it. Doom keeps its current behaviour by passing its `STEP_HEIGHT`;
   portal and platformer-3d keep theirs by not passing one. Step-up decides
   whether a player walks up a low ledge or is stopped by it — a gameplay
   feature, so it must not arrive in a game by accident.

**Options considered.**

1. *Mirror the 2D sibling exactly* (gravity + X + Y only). Rejected: no Z axis,
   and no room for the guard the 3D copies have already proven necessary.
2. *Always allow step-up* (doom's behaviour as the default). Rejected: it would
   silently change how two other games play.
3. *Leave step-up out.* Rejected: doom needs it, and the alternative is a second
   hand-rolled copy of the same helper.

**Boundaries drawn deliberately.**

- **No slopes, no one-way platforms, no moving-platform carry.** Each is canon
  in its own right, but none has a hand-rolled 3D copy to replace and each is a
  distinct feature; they stay on the backlog rather than riding in on this.
- **No capsule collider.** The module resolves against box statics because that
  is what the three copies do; the capsule shape and its narrowphase are
  `collision-3d`'s to add, and this module adopts them, when a consumer wants
  one.
- **No broadphase.** Same stance as the 2D sibling: `broadphase` is injected, so
  a tag scan or a spatial index both work.

**Deviations taken while implementing the above.** Three, all forced by the
consumers, all recorded here rather than silently absorbed:

1. **The moving-body set is an injected `dynamicTag`, not the `Grounded3`
   store.** The plan inherited the 2D sibling's participation rule ("carries
   `Grounded` ⇒ is simulated"), but no consumer works that way: doom simulates
   its enemies, which carry no ground flag at all, and portal simulates the cube
   only while it is *not* held. All three already express their body set as a
   tag (`DynamicBodyTag`, `DynamicBodyTag`, `PlayerTag`), so the module takes one.
   **`Grounded3` is consequently optional per body**: it buys `onGround` and
   step-up, and a body without it is still fully simulated. This is what keeps
   doom behaviour-preserving — its enemies never gain step-up — and keeps
   portal's held-cube rule in the game (`carry` drops `DynamicBodyTag` on grab,
   which `teleport` already ignores for held bodies).
2. **`positionDef` / `velocityDef` are injected** rather than imported. The
   engine has no `modules/transform-3d`, and a kinematics module must not own
   transform components. Precedent: `makeFollowCameraSystem({ positionDef })`.
   Both become nullary defaults here once `transform-3d` ships.
3. **`staticTag` is optional.** It is a *filter* over the broadphase's yield, and
   a game may legitimately want a candidate the tag excludes: portal's resting
   cube is a dynamic body that must still block the player, so portal omits
   `staticTag` and its broadphase yields the exact collider set. Supplying the
   tag keeps the 2D sibling's over-yielding safety for spatial-index
   broadphases. (Caught in peer review: with the tag required, portal's cube
   candidate was silently discarded and player↔cube collision disappeared.)

## API

```ts
interface Kinematics3DTickCtx {
  readonly dtMs: number;
  readonly world: EcsWorld;
}

interface Kinematics3DSystemOptions<TCtx extends Kinematics3DTickCtx> {
  name?: string;
  dynamicTag: TagDef;                        // the bodies this system simulates
  gravity: number;                           // world units per second², as -y
  phase?: string;
  positionDef: ComponentDef<Vec3>;           // injected — see deviation 2
  runAfter?: readonly string[];
  runBefore?: readonly string[];
  staticTag?: TagDef;                        // omit when the yield *is* the set
  stepHeight?: number;                       // omit to disable step-up
  terminalVelocity: number;                  // falling speed cap
  velocityDef: ComponentDef<{ vx: number; vy: number; vz: number }>; // injected
  broadphase: (ctx: TCtx, box: Aabb3) => Iterable<EntityId>;
}

makeKinematics3DSystem<TCtx>(options): SchedulableSystem<TCtx>
```

Component needs stay the 3D set already in the examples: `position3d`,
`velocity3d` (`{vx, vy, vz}`), `ShapeAabb3Def`, `GroundedDef` (3D sibling of the
2D module's), plus the game's own `dynamicTag`.

## Tasks

- [x] `src/modules/kinematics-3d/kinematics3d-system.ts` — gravity → X → Z → Y
      resolve, `onGround`, optional step-up.
- [x] `src/modules/kinematics-3d/grounded.ts` — `Grounded3 { onGround }` +
      `Grounded3Def`.
- [x] `src/modules/kinematics-3d/index.ts` — barrel.
- [x] `kinematics3d-system.test.ts` — resting on a floor, walking into a wall,
      a ceiling stopping an upward move, corner cases, the shallowest-guard case
      (a resting floor must not block or fling horizontal movement, and a body
      embedded in a big block must leave through its shallowest face), step-up on
      and off, and the terminal-velocity clamp. 33 tests.
- [x] `src/modules/kinematics-3d/README.md` — API, the two behaviour decisions,
      canon (Unity `CharacterController`, Godot `CharacterBody3D`), "not
      included (by design)".
- [x] Adopt in doom — step-up on, via its current `STEP_HEIGHT`; `GroundedDef`
      re-exported from the engine (its enemies stay un-grounded, so un-stepped).
- [x] Adopt in portal — step-up off, guard already present, so
      behaviour-preserving; `carvedSurfaces` and the one-way cube move into the
      injected `broadphase`, and `carry` now drops `DynamicBodyTag` while held.
- [x] Adopt in platformer-3d — step-up off; **the guard is new here**, so this
      is the one example whose behaviour changes.
- [x] `npm run docs:api`; drop the `kinematics-3d` row from the 3D group table.
- [x] `npm test` (79 files / 1292 tests) + `npm run lint` clean; `tsc --noEmit`
      clean in the 3D examples.
- [x] Peer review to LGTM.

## Invariants

- Pure ECS glue over `collision-3d`'s narrowphase and `math-3d`'s maths; no new
  vector maths of its own.
- Stateless: all per-tick scratch on the stack, no module-level mutable state.
- The resolver never mutates a static body — only the moving one.
- `broadphase` is called once per axis per body with that axis' projected box.

## Behaviour deltas to accept knowingly

1. The shallowest-penetration guard reaches **platformer-3d only**. Doom and
   portal already have it, in near-identical form, so adopting the module is
   behaviour-preserving for them. Expect platformer-3d to stop squeezing or
   tunnelling at thin walls, and to stop having horizontal motion blocked by the
   floor it is resting on.
2. Nothing else: step-up stays off unless a game asks for it, so doom is the only
   one whose feature set is unchanged by construction. In particular doom's
   enemies keep the exact resolver they had (simulated, never stepping up) now
   that they carry no `Grounded3`.
3. Portal's carve is now re-evaluated per axis from that axis' **projected**
   position rather than once per body from the pre-move one. It can therefore
   switch on *earlier* — a body crossing the portal plane inside one fast step
   is carved rather than blocked a tick — and symmetrically drop out on a later
   axis when the projected centre has left the opening. It gets a playtest like
   the rest.

**Playtested.** Doom, portal and platformer-3d were played after the migration
and behaved as described above.
