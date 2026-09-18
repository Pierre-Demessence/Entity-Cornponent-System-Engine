# Starfighter — Postmortem

One-page shape-validation writeup. Engine gaps are recorded as symptoms in
the [engine gap ledger](../../docs/roadmap/engine-gap-ledger.md); this doc is
the narrative of what building the example taught us. It does **not** decide
which gaps become modules — that is the triager's job.

## What it set out to prove

That `@pierre/ecs` can host a **third-person, freely-oriented 3D flyer** whose
camera is neither a yaw-only orbit (platformer-3d) nor a first-person body
(doom, portal). The defining question: is the ECS core agnostic enough that a
full 3-axis attitude craft with a chase camera drops in with zero engine
changes?

Answer: **yes.** The engine stayed byte-identical. Everything specific to the
game — orientation, flight, camera, targets — lives in the example as plain
systems over `Position3D` / `Velocity3D` / `Radius` stores and three tags.

## What it validated

- **The scheduler + tick/render split scales to a 3D flyer unchanged.** Four
  ordered systems (`ship` → `weapon` → `bullet` → `target`) on the fixed
  logic tick; a separate `AnimationFrameTickSource` drives three.js. No new
  engine surface touched.
- **ECS-as-source-of-truth holds for a moving camera.** The renderer derives
  every mesh + the camera purely from component data each frame; the
  orientation quaternion lives in game state, and the render layer only reads
  it. Deferred `queueDestroy` + a local `destroyed` set correctly handle
  "one bullet, one target" against mid-tick destroys.
- **`modules/rng` fits drone spawning** (seeded, deterministic restart).

## The shape lesson (flight model)

The first cut was literal "6DOF": body-relative thrust on all three local
axes (forward/strafe/climb) with drag + a max-speed clamp, steered by a
pointer-lock relative mouse-look copied from doom/portal. Playtesting showed
that's the **wrong shape** for "control a spaceship" — it flies like a
free-cam, not a craft. The rebuild switched to **aim-to-steer attitude
control** (No Man's Sky / Elite): a reticle sets a *rate* of turn past a
deadzone, the ship's angular velocity eases toward it (so turns take time),
roll on A/D, throttle-only forward motion, and a chase camera that slerps its
orientation to bank with the craft. This is the shape worth keeping, and it
surfaced a **quaternion attitude** need that the yaw/pitch-only 3D examples
never hit.

## Engine gaps hit (symptoms — see the ledger)

Joined existing 3D rows as a 4th consumer:

- **3D scene renderer + entity→mesh sync** — hand-rolled the same
  `Map<EntityId, Mesh>` create/update/reap scaffold as platformer-3d / portal
  / doom.
- **3D transform components** — redefined `Position3D` / `Velocity3D` locally.

New rows this example opened:

- **3D vector math + quaternion** — no `Vec3` helpers and, more sharply, **no
  quaternion type** anywhere in the engine; the example ships a whole small
  `quat.ts` (mul / axis-angle / rotate / forward-up) for its attitude.
- **Attitude-control flight model** — rate-based angular-velocity steering with
  a deadzone + roll + throttle, distinct from the gravity+ground AABB
  `kinematics` movers.
- **Third-person chase-camera rig** — trailing, roll-banking camera (position
  lerp + orientation slerp), distinct from the orbit / first-person rigs.

Notably **dropped** from the pointer-lock relative-look row: the redesign uses
a free-cursor reticle, not pointer-lock — so this example no longer supports
that gap.

## Candidate promotions (writer flags, does not decide)

- The **quaternion half of the 3D-vector-math gap** is the strongest signal:
  any freely-oriented 3D body (flyer, free-cam, ball-with-spin) needs it, and
  it is unambiguous canon. A `Vec3` + `Quat` sibling to `modules/math` /
  `modules/motion` is the obvious home — but that call is the triager's.
- The chase-camera and attitude-flight rows are single-consumer and
  genre-specific; they should wait for a second consumer before anyone
  considers a module.

## Anti-goals (kept out on purpose)

No health/damage on the ship, no target return-fire, no menus, no audio — one
mechanic (fly + shoot drifting targets) on one screen, per the examples rules.
