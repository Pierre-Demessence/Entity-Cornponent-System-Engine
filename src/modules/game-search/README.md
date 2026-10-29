# `@pierre/ecs/modules/game-search`

Look-ahead search for computer opponents in turn-based games: the computer
tries moves, the replies to them and the replies to those, and picks the move
that ends best. It works on plain game states, with no world, so it suits
board and card games whose rules are a few functions over a JSON-like state.

## Describing the rules

A `SearchGame` is four functions over your state type `S`, move type `M` and
player id type `P` (default `number`):

```ts
import type { SearchGame } from '@pierre/ecs/modules/game-search';

import { alphaBetaSearch } from '@pierre/ecs/modules/game-search';

// Nim: take 1 to 3 from a pile; whoever takes the last one wins.
interface Nim { pile: number; player: number }

const nim: SearchGame<Nim, number> = {
  apply: (state, take) => ({ pile: state.pile - take, player: 1 - state.player }),
  currentPlayer: state => state.player,
  moves: state => [1, 2, 3].filter(take => take <= state.pile),
  outcome: (state, player) => (player === state.player ? -1 : 1), // the player to move found an empty pile
};

const best = alphaBetaSearch(nim, { pile: 10, player: 0 }, { evaluate: () => 0 });
console.log(best.move, best.score); // 2: leaves 8, a multiple of 4
```

- `moves(state)` lists the legal moves, and `[]` once the game is over. A state
  with no moves is final; a game with forced passes models the pass as a move.
  It returns the same order for the same state.
- `apply(state, move)` returns a **new** state and never changes the old one;
  the same arguments always give the same result.
- `currentPlayer(state)` says who moves; it is only called on non-final states
  and players are compared with `===`.
- `outcome(state, player)` is the result of a final state for `player`: `-1` a
  loss, `0` a draw, `1` a win.

Chance (dice, a shuffled deck) belongs in the state, for example the `state`
field of a `SeededRng`, so `apply` stays deterministic. A search then sees one
fixed future rather than every possible roll.

## Alpha-beta search

`alphaBetaSearch(game, state, options)` searches one move deeper each round
(iterative deepening) with alpha-beta pruning, and returns the best move of the
last round that finished.

```ts
interface AlphaBetaResult<M> {
  move: M | undefined; // undefined when the state has no legal move
  score: number;       // from the side of the player to move at the root
  depth: number;       // deepest look-ahead that finished
  nodes: number;       // moves tried
  complete: boolean;   // true when score is exact
}
```

`evaluate(state, player)` is required: it scores a position the search stopped
short of, from `player`'s side (higher is better). Keep it within
`±WIN_SCORE / 2`. Final states score `±(WIN_SCORE - n)` for a win or loss `n`
moves ahead, so the search prefers faster wins and slower losses;
`score > WIN_SCORE / 2` means a forced win and `score < -WIN_SCORE / 2` a
forced loss. A search stops as soon as it proves either.

**Difficulty is a budget.** With no budget the search runs to the end of the
game, which only suits small games (a game that can loop needs a budget). Otherwise
set any of:

- `maxDepth` — moves of look-ahead.
- `maxNodes` — moves tried across all rounds.
- `timeMs` — wall-clock time; the clock is `performance.now` unless you pass
  `now` (a test clock, say).

The first round always finishes, so a legal move comes back whenever one
exists, even with a budget of `0`. A weaker opponent is a smaller budget, or a
coarser `evaluate`.

**Move ordering.** Alpha-beta prunes most when good moves are tried first. The
search follows the order `moves` returns, after the best move of the previous
round, so list likely-good moves first (in Connect Four, the centre columns).

**Transposition table.** Pass `key(state)`, a string or number identifying a
position, and positions reached by different move orders are searched once. It
holds up to `maxTableEntries` (default `2 ** 20`) and is cleared when full; it
lives for one call.

**Ties.** Among equally good moves the search keeps the best move of the previous
round, and in the first round the first one listed. Pass `random` (a
`RandomFn`, such as `makeSeededRng(seed)`) to shuffle the root moves once, so
the computer varies its play and a fixed seed repeats it. A seed with a node
budget gives the same move on every run; a time budget does not.

**More than two players, and extra turns.** The search maximizes on the
root player's turns and minimizes on everyone else's, so with three or more
players it assumes all the others play against the root player (a cautious
"paranoid" estimate), and a move that leaves the same player to move is scored
from that player's side.

## Running it in a worker

A deep search blocks the main thread. Functions cannot be posted to a worker, so
the worker imports the rules itself and receives only the state:

```ts
// ai-worker.ts
import { alphaBetaSearch } from '@pierre/ecs/modules/game-search';
import { handleJobs } from '@pierre/ecs/modules/worker-pool';

import { evaluate, rules } from './rules';

handleJobs((state: GameState) => alphaBetaSearch(rules, state, { evaluate, timeMs: 500 }).move);
```

The main thread sends states with `WorkerPool` from `modules/worker-pool`; a
state must be plain data to be posted.

## Dependencies

- `modules/rng` — `RandomFn` and `shuffle`, used for the `random` option.
- `modules/worker-pool` — only in the worker sample above; the search itself
  does not import it.
