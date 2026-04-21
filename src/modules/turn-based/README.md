# `@pierre/ecs/modules/turn-based`

`TurnCycler` — round-robin active-turn rotation across tagged entities.
This is an **opt-in turn-based module**, not a core ECS primitive —
real-time games don't use it.

## API

```ts
interface TurnCyclerTags {
  readonly controlled: TagDef;   // entities that take turns
  readonly activeTurn: TagDef;   // entity currently holding the turn
  readonly cameraTarget?: TagDef; // optional — moved in lockstep with activeTurn
}

class TurnCycler {
  constructor(world: EcsWorld, tags: TurnCyclerTags);

  readonly activeEntityId: EntityId | undefined;
  readonly allControlledEntitiesActed: boolean;

  advance(): boolean;
}
```

Parameterized by the `controlled` tag (which entities take turns) and
the `activeTurn` tag (which one currently holds the turn). Optional
`cameraTarget` is moved in lockstep with `activeTurn` when provided.

## Behaviour

- `advance()` moves the `activeTurn` tag to the next `controlled`
  entity in insertion order, and moves `cameraTarget` in lockstep when
  configured.
- Returns `true` when the round **wrapped** (i.e. AI turn should run
  next), `false` otherwise. No-ops return `true` when there are 0 or 1
  controlled entities.
- `allControlledEntitiesActed` is `true` when the active-turn tag is
  back on the first controlled entity — i.e. every controlled entity
  has had its turn this round. Trivially `true` for 0 or 1 controlled
  entities.

## Usage

```ts
import { TurnCycler } from '@pierre/ecs/modules/turn-based';

const cycler = new TurnCycler(world, {
  controlled: ControlledTag,
  activeTurn: ActiveTurnTag,
  cameraTarget: CameraTargetTag, // optional
});

// after each player action
const wrapped = cycler.advance();
if (wrapped) runAiTurn();
```

Import via `@pierre/ecs/modules/turn-based`.
