# `@pierre/ecs/modules/turn-based`

Turn order for turn-based games. This is an **opt-in turn-based module**, not a
core ECS primitive — real-time games don't use it.

Two layers, use whichever fits your state:

- **`TurnOrder`** — plain data: a list of seats, the active one, and counters.
  Use it when your game state is plain data (a JSON object you save, diff or
  send over the wire), for hot-seat board and card games.
- **`TurnCycler`** — the same rotation over entities in an `EcsWorld`, driven by
  tags.

## Plain turn order

```ts
import type { TurnOrder } from '@pierre/ecs/modules/turn-based';

import { addSeat, advanceTurn, currentSeat, makeTurnOrder, passTurnTo, removeSeat, reverseTurns } from '@pierre/ecs/modules/turn-based';

interface Game { turn: TurnOrder<string> }

const game: Game = { turn: makeTurnOrder(['ann', 'bob', 'cy']) };

advanceTurn(game.turn); // bob's turn
advanceTurn(game.turn, 1); // a "skip" card: cy is passed over, so ann is next
console.log(currentSeat(game.turn), game.turn.rounds); // 'ann' 1

reverseTurns(game.turn); // a "reverse" card: play goes the other way
passTurnTo(game.turn, 'cy'); // cy won the trick and leads
removeSeat(game.turn, 'bob'); // bob drops out
addSeat(game.turn, 'dee'); // dee joins at the end

const saved = JSON.stringify(game); // still plain data
```

```ts
interface TurnOrder<T> {
  seats: T[];            // play order; any id: number, string, EntityId
  active: number;        // index into seats of the seat holding the turn
  direction: 1 | -1;     // which way advanceTurn walks
  turns: number;         // completed turns
  rounds: number;        // completed rounds (passes over the wrap point)
}

function makeTurnOrder<T>(seats: readonly T[], first?: number): TurnOrder<T>;
function currentSeat<T>(order: TurnOrder<T>): T | undefined;
function nextSeat<T>(order: TurnOrder<T>): T | undefined;
function advanceTurn<T>(order: TurnOrder<T>, skip?: number): boolean;
function passTurnTo<T>(order: TurnOrder<T>, seat: T): void;
function reverseTurns<T>(order: TurnOrder<T>): void;
function addSeat<T>(order: TurnOrder<T>, seat: T, index?: number): void;
function removeSeat<T>(order: TurnOrder<T>, seat: T): boolean;
```

- **`makeTurnOrder`** copies `seats` and makes `first` (an index, default `0`)
  active. It throws when `first` is not a valid index of a non-empty list.
- **`currentSeat` / `nextSeat`** read the active seat and the one after it in
  the current direction. Both are `undefined` with no seats.
- **`advanceTurn`** ends the turn and moves to the next seat in `direction`,
  passing over `skip` seats. `turns` goes up by one; each pass over the wrap
  point (last to first going forward, first to last when reversed) adds one to
  `rounds`, and a large `skip` can cross it several times. It returns whether
  it wrapped at least once. With one seat every advance wraps; with no seats it
  does nothing and returns `false`.
- **`passTurnTo`** hands the turn to a given seat, as when the winner of a trick
  leads. It counts a turn but not a round, and throws, changing nothing, when
  the seat is not in the order.
- **`reverseTurns`** flips `direction`; the active seat keeps the turn.
- **`addSeat` / `removeSeat`** change the seat list without disturbing whose
  turn it is. If the removed seat held the turn, the seat that would have come
  next in `direction` takes it. Counters are untouched. `removeSeat` returns
  `false` for an absent seat.
- An **extra turn** (a Checkers multi-jump) needs no helper: do not advance.
- Seats are expected to be distinct; lookups match the first `===` hit.

## World: `TurnCycler`

Round-robin active-turn rotation across tagged entities, built on the same
`advanceTurn`.

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

Parameterized by the `controlled` tag (which entities take turns) and the
`activeTurn` tag (which one currently holds the turn). Optional `cameraTarget`
is moved in lockstep with `activeTurn` when provided.

- `advance()` moves the `activeTurn` tag to the next `controlled` entity in
  insertion order, and moves `cameraTarget` in lockstep when configured.
- Returns `true` when the round **wrapped** (i.e. AI turn should run next),
  `false` otherwise. No-ops return `true` when there are 0 or 1 controlled
  entities.
- `allControlledEntitiesActed` is `true` when the active-turn tag is back on the
  first controlled entity — i.e. every controlled entity has had its turn this
  round. Trivially `true` for 0 or 1 controlled entities.

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
