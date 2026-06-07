# modules/attach — Parent-Child Attachment

Plan for the `modules/attach` backlog item (2 ledger rows: rider kinematics + follower transform sync).

## Gap

Three consumers hand-roll entity attachment patterns:
- **asteroids**: thrust flame snaps position + rotation to the ship each tick
- **frogger**: frog on log inherits the platform's velocity each tick (`pos.x += vx * dt`)
- **space-invaders**: aspirational (no current hand-roll found)

No engine primitive for "entity B follows entity A."

## Design

A single `AttachDef` component with three orthogonal boolean flags:

```ts
interface Attach {
  parent: EntityId;
  /** Add parent's velocity × dt to this entity's position each tick. */
  inheritVelocity?: boolean;
  /** Snap this entity's position to the parent's each tick. */
  snapPosition?: boolean;
  /** Snap this entity's rotation to the parent's each tick. */
  snapRotation?: boolean;
}
```

One `makeAttachSystem()` factory that runs **after** movement/collision
systems — parents have their final position/velocity, children either
snap or accumulate.

## Subtasks

- [x] Create `src/modules/attach/` with `attach.ts` + `index.ts` + `README.md`
- [x] Unit tests in `attach.test.ts`
- [x] Export from module barrel
- [x] Regenerate `engine-api.md`
- [x] Migrate asteroids thrust-flame system to `AttachDef`
- [x] Frogger: skipped — support changes every tick, offscreen check tightly coupled
- [x] Typecheck + lint + test — all green
- [x] Update ledger rows (rider + follower) to RESOLVED
