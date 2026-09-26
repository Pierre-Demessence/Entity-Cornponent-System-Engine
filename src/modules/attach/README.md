# `@pierre/ecs/modules/attach`

One-way attachment: an entity follows another entity's position, rotation,
and velocity each tick. This is a lightweight slice of entity parenting; a
full transform hierarchy with N-level propagation is a deliberate non-goal
(`docs/roadmap/non-goals.md`).

The relation is read in one direction only: the child reads the parent. There
is no child list, no reparenting API, and moving a child never moves its
parent. Attach one entity to another, or many entities to the same one.

## API

```ts
interface Attach {
  parent: EntityId;            // required — the entity to follow
  inheritVelocity?: boolean;   // add parent.velocity × dt to own position
  snapPosition?: boolean;      // own position := parent position
  snapRotation?: boolean;      // own rotation := parent rotation
}

const AttachDef: ComponentDef<Attach>;

interface AttachTickCtx { dtMs: number; world: EcsWorld }
interface AttachSystemOptions { name?: string; runAfter?: string[] }

function makeAttachSystem<TCtx extends AttachTickCtx>(
  options?: AttachSystemOptions,
): SchedulableSystem<TCtx>;
```

Each tick, for every entity carrying `AttachDef`, the system applies the
enabled flags in a fixed order: `inheritVelocity`, then `snapPosition`, then
`snapRotation`.

## Requirements and edge cases

- **The child needs a `Position`.** An `Attach` entity without one is skipped
  entirely — even for `snapRotation`.
- **`snapPosition` beats `inheritVelocity`.** Snap is applied after inherit, so
  enabling both leaves the child exactly on the parent and makes inherit
  redundant. Use `snapPosition` for a fixed mount; use `inheritVelocity` for a
  rider that keeps its own offset (a frog on a moving log).
- **A missing parent is skipped, not an error.** If the parent has no
  `Position` — despawned, destroyed, or never spawned — the child is left alone
  for that tick. Nothing cascades: destroying a parent neither detaches nor
  destroys its children.
- **All four components must be registered.** `makeAttachSystem` resolves the
  `position`, `velocity`, `rotation` and `attach` stores on every tick, so
  registering only `AttachDef` throws `Component "velocity" is not registered`
  even when no entity uses `inheritVelocity`.
- **`inheritVelocity` reads the parent's `Velocity`.** A parent without one
  makes the flag a no-op; the two snap flags still apply.
- **`snapRotation` needs `Rotation` on both sides.** If either side lacks it,
  the rotation copy is skipped.

## Usage

```ts
import { AttachDef, makeAttachSystem } from '@pierre/ecs/modules/attach';
import { PositionDef, RotationDef, VelocityDef } from '@pierre/ecs/modules/transform';

// the system touches all four stores every tick, so all four must be registered
world.registerComponent(PositionDef);
world.registerComponent(VelocityDef);
world.registerComponent(RotationDef);
world.registerComponent(AttachDef);
scheduler.add(makeAttachSystem({ runAfter: ['movement'] }));

const hull = world.spawn({
  name: 'hull',
  components: { position: { x: 100, y: 100 }, rotation: { angle: 0 } },
});

// a thrust flame pinned to the hull
world.spawn({
  name: 'thrust-flame',
  components: {
    attach: { parent: hull, snapPosition: true, snapRotation: true },
    position: { x: 0, y: 0 },
    rotation: { angle: 0 },
  },
});
```

Schedule it **after movement** so parents have settled into their final
position for the tick — `runAfter: ['movement']` is how both shipped consumers
(`examples/asteroids`, `examples/spacewar`) wire it. The tick context must
satisfy `AttachTickCtx`, i.e. provide `dtMs` and `world`.
