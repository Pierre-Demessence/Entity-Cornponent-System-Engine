# Plan: `modules/game-search`

Delivers the backlog's Ready `modules/game-search` entry: look-ahead search for
computer opponents in turn-based games, over plain game states, with no world.
Part A (alpha-beta) and Part B (MCTS) share only the game contract and land in
separate commits, A first. First consumer: BoardGames' Connect Four (its
roadmap M2.2), then Checkers (M3.2).

## Goal

A turn-based game that describes its rules as a handful of functions over plain
states gets a computer player that looks several moves ahead, with its strength
set by a depth, node or time budget, and that can run in a worker.

## Acceptance criteria

- AC1. WHEN `alphaBetaSearch` runs on a tic-tac-toe fixture without a budget,
  THE SYSTEM SHALL return a move that never loses against every reply, with
  `complete: true` and score 0 from the empty board. Check: `alpha-beta.test.ts`.
- AC2. WHEN a one-move win exists at depth ≥ 1, THE SYSTEM SHALL play it, and
  prefer the faster of two forced wins; WHEN the opponent threatens a one-move
  win, it SHALL block. Check: `alpha-beta.test.ts`.
- AC3. WHEN `maxDepth`, `maxNodes` or `timeMs` runs out, THE SYSTEM SHALL return
  the best move of the last completed depth, and depth 1 SHALL always complete,
  so a legal move comes back whenever one exists. `timeMs` is checked with an
  injected `now`. Check: `alpha-beta.test.ts`.
- AC4. WHEN `key` is given, THE SYSTEM SHALL return the same score and visit
  fewer nodes than without it on the same search. Check: `alpha-beta.test.ts`.
- AC5. WHEN a move leaves the same player to move (an extra turn), THE SYSTEM
  SHALL score it from that player's side, not the opponent's. Check: an
  extra-turn fixture in `alpha-beta.test.ts` and `mcts.test.ts`.
- AC6. WHEN the state has no legal move, both searches SHALL return
  `move: undefined`; WHEN it has one, they SHALL return it without searching.
  Check: both test files.
- AC7. WHEN `random` is the same seeded rng and the budget is node- or
  iteration-based, THE SYSTEM SHALL return the same move on every run, and
  different seeds SHALL vary the choice among equally good moves. Check: both
  test files.
- AC8. WHEN `mctsSearch` runs 2 000 iterations on tic-tac-toe positions with a
  one-move win or a threat, THE SYSTEM SHALL take the win or block, for a fixed
  seed; with three players it SHALL credit each move to the player who made it.
  Check: `mcts.test.ts`.
- AC9. WHEN a rollout reaches `maxRolloutDepth` (a game that can loop), THE
  SYSTEM SHALL stop it and score the position with `evaluate`, or as a draw
  without one. Check: a looping fixture in `mcts.test.ts`.
- AC10. WHEN a budget value is negative or not a number, or `exploration` is
  negative, THE SYSTEM SHALL throw. Check: both test files.
- AC11. THE SYSTEM SHALL pass the full gate: `npm run lint`, `npm run
  typecheck`, `npm test` (doc-sample compile, README symbol check, API and
  usage drift included).

## Design

New `src/modules/game-search/` (`index.ts`, `game.ts`, `alpha-beta.ts`,
`mcts.ts`, tests beside them, `README.md`). Pure functions, no core imports
beyond `RandomFn` from `modules/rng` (a documented module dependency). The
`./modules/*` export wildcard covers it; `scripts/manual.ts` lists it under
"AI and decision making".

### The game contract (`game.ts`)

```ts
interface SearchGame<S, M, P = number> {
  currentPlayer: (state: S) => P;           // compared with ===; called on non-final states only
  moves: (state: S) => readonly M[];        // [] once the game is over; same order for the same state
  apply: (state: S, move: M) => S;          // a new state; never mutates `state`; deterministic
  outcome: (state: S, player: P) => number; // final result for `player`, -1 loss .. 0 draw .. 1 win
}
```

Final = `moves` is empty; a game with forced passes models the pass as a move.
Randomness inside a game (dice) lives in the state, such as a `SeededRng.state`
field, so `apply` stays deterministic. BoardGames adapts its `GameRules` in a few
lines (`moves` returns `[]` when `status` is not `'playing'`).

### Part A — `alphaBetaSearch(game, state, options): AlphaBetaResult<M>`

Options: `evaluate(state, player)` (required; heuristic for a non-final state
from `player`'s side, kept within ±`WIN_SCORE / 2`), `maxDepth`, `maxNodes`,
`timeMs`, `now` (default `performance.now`), `key(state)` (string or number;
turns on the transposition table), `maxTableEntries` (default 2^20), `random`
(shuffles the root moves once, so ties vary). No budget means search to the end.

Result: `{ move, score, depth, nodes, complete }` — `depth` is the last
completed depth, `complete` says the whole tree was searched (the score is
exact), `score` is from the root player's side.

- Minimax with alpha-beta from the root player's side: a node maximizes when
  `currentPlayer` is the root player and minimizes otherwise. That handles extra
  turns (AC5) and, with three or more players, is the "paranoid" search (every
  other player plays against you); the README says so.
- Final states score `outcome × (WIN_SCORE − ply)`, so faster wins and slower
  losses rank higher. `WIN_SCORE` (1e9) is exported; `score > WIN_SCORE / 2`
  means a forced win.
- Iterative deepening from depth 1; it stops early when an iteration hit no
  depth cutoff (`complete`). The previous best root move is searched first.
- Budget: nodes counted per `apply`; the clock is read every 1 024 nodes. An
  exhausted budget aborts the iteration, except depth 1, which always finishes.
- Transposition table: a `Map` per call, entries `{ depth, value, bound, best
  move index }`, cleared when full; its best move is tried first. Values are
  stored from the root player's side, valid because the table never outlives
  the call. Ply-adjusted win scores are stored relative to the node.
- Move ordering otherwise follows `moves()`; the README tells consumers to list
  likely-good moves first (Connect Four: centre columns).

### Part B — `mctsSearch(game, state, options): MctsResult<M>`

Options: `iterations`, `timeMs`, `now` (default 1 000 iterations when neither is
given), `random` (default `Math.random`), `exploration` (UCT constant, default
√2), `rollout(state, random)` (playout policy returning a move; default uniform),
`maxRolloutDepth` (default 1 000), `evaluate(state, player)` (scores a cut
rollout, -1..1; default draw).

Result: `{ move, iterations, visits, value }` — the chosen move's visit count
and mean result (-1..1) for the root player.

- UCT: select by mean + `exploration · √(ln N / n)` on results mapped to 0..1,
  expand one untried move per iteration, roll out, back up. Each node's result
  is the outcome for the player who made the move into it, so any number of
  players works (AC8) and extra turns too.
- The chosen move is the most visited root child; ties go to the higher mean.
- The tree lives for one call; reuse across moves is deferred (backlog V2).

### Worker use

No engine code: the consumer's worker imports its rules and the search and
calls `handleJobs(state => alphaBetaSearch(game, state, opts).move)`. The README
shows it, since functions cannot be posted to a worker.

### Not included

Deferred to the backlog's `modules/game-search` V2 entry (added with this
plan): quiescence search, reuse of the table or tree across moves, the
principal variation, chance nodes (expectimax), MCTS-solver, max^n. No in-repo
example: the roadmap's Tic-Tac-Toe rung is the natural first one.

## Checklist

Status: Part A done and committed; next is Part B.

### Part A — game contract and alpha-beta

- [ ] `game.ts` (`SearchGame`) and `alpha-beta.ts` (`alphaBetaSearch`,
  `AlphaBetaOptions`, `AlphaBetaResult`, `WIN_SCORE`) with JSDoc; export from
  `index.ts`.
- [ ] Shared test fixtures in `src/modules/game-search/test-games.ts` (not exported from `index.ts`, like `src/test-utils.ts`)
  (tic-tac-toe, Nim, an extra-turn game, a looping game, a three-player game).
- [ ] `alpha-beta.test.ts` covering AC1–AC7 and AC10.
- [ ] `README.md`: what it is, the contract with a runnable Nim sample,
  alpha-beta, difficulty by budget, move ordering, worker use; dependency on
  `modules/rng` stated. Add the module to `scripts/manual.ts`.
- [ ] `npm run docs:api && npm run docs:usage`; full gate (AC11).

Visible after: `@pierre/ecs/modules/game-search` exports `alphaBetaSearch`;
BoardGames can start M2.2.
Needs you: nothing.

### Part B — MCTS and finishing

- [ ] `mcts.ts` (`mctsSearch`, `MctsOptions`, `MctsResult`) with JSDoc; export.
- [ ] `mcts.test.ts` covering AC5–AC10 for MCTS.
- [ ] README: MCTS section (when to use it over alpha-beta, rollout policy,
  budget).
- [ ] `docs/game-ai-landscape.md`: game-tree search becomes shipped (✅, link
  the module; drop it from the gaps list).
- [ ] Delete the `modules/game-search` Ready entry from `docs/backlog.md` (the
  V2 entry stays) and this plan; `npm run docs:api && npm run docs:usage`; full
  gate (AC11).

Visible after: `mctsSearch` is available; the Manual lists the module.
Needs you: nothing.

## Finishing

No new decision: plain-data rules are already
[decided](../decisions.md#discrete-game-logic-is-plain-data-first-components-second).
BoardGames does not use the module yet, so nothing downstream breaks.
