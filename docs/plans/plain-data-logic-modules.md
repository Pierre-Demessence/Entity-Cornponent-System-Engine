# Plan: plain-data cores for `modules/pile` and `modules/turn-based`

Applies the layering principle "Plain data first for discrete logic"
([extending-the-engine.md](../extending-the-engine.md#plain-data-first-for-discrete-logic))
to the two discrete-logic modules that are world-only today. Part A and Part B
share no code and land in separate commits, in either order.

## Goal

A game that keeps its state as plain JSON outside the world (BoardGames) can
use piles and turn order directly on that state, while world-based games keep
using the same modules through their component wrappers.

## Acceptance criteria

- AC1. WHEN `moveTop`, `moveAll` or `moveItem` run on plain arrays of any item
  type (numbers, objects), THE SYSTEM SHALL move items with the same order
  semantics as the world pile operations, in place, with no world. Check:
  `pile-array.test.ts`.
- AC2. WHEN `moveItem` is given an item absent from `from`, THE SYSTEM SHALL
  return `false` and change neither array. Check: `pile-array.test.ts`.
- AC3. WHEN the world pile API is used, THE SYSTEM SHALL keep every current
  behaviour, including `InPile` consistency and save/load, under the renamed
  `movePileTop` / `movePileAll`. Check: existing `pile.test.ts`, migrated.
- AC4. WHEN a `TurnOrder` is advanced, handed to a seat, reversed, or has a
  seat added or removed, THE SYSTEM SHALL keep the active seat, `turns` and
  `rounds` as the Design section defines, and the value SHALL survive
  `JSON.parse(JSON.stringify(order))` unchanged. Check: `turn-order.test.ts`.
- AC5. WHEN `passTurnTo` is given a seat that is not in the order, THE SYSTEM
  SHALL throw and leave the order unchanged. Check: `turn-order.test.ts`.
- AC6. WHEN `TurnCycler` is used, THE SYSTEM SHALL behave as today. Check:
  existing `turn-cycler.test.ts` unchanged and green.
- AC7. THE SYSTEM SHALL pass the full gate: `npm run lint`, `npm run typecheck`,
  `npm run typecheck:examples`, `npm test` (doc-sample compile, README symbol
  check, API and usage drift tests included).

## Design

### Part A — `modules/pile`

New `src/modules/pile/pile-array.ts`, exported from the module barrel:

- `moveTop<T>(from: T[], to: T[], count = 1): T[]` — top `count` items of
  `from` onto `to`, order kept; fewer when `from` holds fewer; `count` is
  truncated and clamped at 0. Returns the moved items, bottom first.
- `moveAll<T>(from: T[], to: T[], options?: MoveAllOptions): T[]` — empties
  `from` onto `to`; `reverse` flips the order. Returns them in the order added.
- `moveItem<T>(from: T[], to: T[], item: T, index?: number): boolean` — removes
  the first `===` match from `from` and inserts it into `to` at `index`
  (default top, clamped, truncated). `from === to` reorders, with `index`
  counted after the removal, as `addToPile` does today.
- `from === to` for `moveTop` / `moveAll` follows splice-then-push: unchanged,
  or reversed by `moveAll` with `reverse`. No special case.
- Shuffling stays `shuffle` from `modules/rng`; no pile-specific copy.

World wrapper (`pile.ts`): `Pile`, `InPile`, both defs, `installPiles`,
`createPile`, `pileItems`, `pileSize`, `pileTop`, `pileOf`, `indexInPile`,
`addToPile`, `removeFromPile` and `shufflePile` keep their signatures. The world
`moveTop` / `moveAll` are renamed `movePileTop` / `movePileAll` to free the
plain names (breaking, pre-1.0; examples migrate). They keep their behaviour;
delegating to the plain helpers is the implementer's choice, as long as
`InPile` stays in step and `markChanged` still fires.

README: a "Plain arrays" section first (the BoardGames use: piles as fields of
a JSON state), then the world section; the API listing gains the three helpers.

### Part B — `modules/turn-based`

New `src/modules/turn-based/turn-order.ts`, exported from the module barrel:

```ts
interface TurnOrder<T> { seats: T[]; active: number; direction: 1 | -1; turns: number; rounds: number }
```

`T` is any seat id (number, string, `EntityId`); the value is JSON-safe when
`T` is. `turns` and `rounds` count completed turns and completed rounds, both
starting at 0.

- `makeTurnOrder<T>(seats: readonly T[], first = 0): TurnOrder<T>` — copies
  `seats`; throws on an out-of-range `first` when seats exist.
- `currentSeat(order): T | undefined` / `nextSeat(order): T | undefined` —
  `undefined` with no seats.
- `advanceTurn(order, skip = 0): boolean` — moves `1 + skip` seats in
  `direction`; `turns += 1`; each pass over the wrap point (last → first going
  forward, first → last reversed) adds 1 to `rounds`. Returns whether it
  wrapped at least once. One seat: every advance wraps. No seats: no-op,
  returns `false`.
- `passTurnTo(order, seat): void` — makes `seat` active; `turns += 1`,
  `rounds` unchanged (trick-taking leads, "winner starts"). Throws when absent.
- `reverseTurns(order): void` — flips `direction`; the active seat stays.
- `addSeat(order, seat, index = seats.length): void` — the active seat stays.
- `removeSeat(order, seat): boolean` — the active seat stays; if it is the one
  removed, the seat that came next in `direction` becomes active; counters
  unchanged. `false` when absent.

An extra turn (a Checkers multi-jump) needs no helper: the caller does not
advance.

`TurnCycler` keeps its public surface and behaviour (AC6). Its `advance()`
builds a `TurnOrder<EntityId>` from the `controlled` tag order and the
`activeTurn` holder, calls `advanceTurn`, and writes the tags back. Its 0- and
1-entity results stay `true` as today. Speed / energy scheduling stays the
backlog's untriaged `TurnCycler` row.

README: plain `TurnOrder` first (seats in a JSON state, hot-seat play), then
`TurnCycler` as the world wrapper.

## Checklist

### Part B — `modules/turn-based`

New `src/modules/turn-based/turn-order.ts`, exported from the module barrel:

```ts
interface TurnOrder<T> { seats: T[]; active: number; direction: 1 | -1; turns: number; rounds: number }
```

`T` is any seat id (number, string, `EntityId`); the value is JSON-safe when
`T` is. `turns` and `rounds` count completed turns and completed rounds, both
starting at 0.

- `makeTurnOrder<T>(seats: readonly T[], first = 0): TurnOrder<T>` — copies
  `seats`; throws on an out-of-range `first` when seats exist.
- `currentSeat(order): T | undefined` / `nextSeat(order): T | undefined` —
  `undefined` with no seats.
- `advanceTurn(order, skip = 0): boolean` — moves `1 + skip` seats in
  `direction`; `turns += 1`; each pass over the wrap point (last → first going
  forward, first → last reversed) adds 1 to `rounds`. Returns whether it
  wrapped at least once. One seat: every advance wraps. No seats: no-op,
  returns `false`.
- `passTurnTo(order, seat): void` — makes `seat` active; `turns += 1`,
  `rounds` unchanged (trick-taking leads, "winner starts"). Throws when absent.
- `reverseTurns(order): void` — flips `direction`; the active seat stays.
- `addSeat(order, seat, index = seats.length): void` — the active seat stays.
- `removeSeat(order, seat): boolean` — the active seat stays; if it is the one
  removed, the seat that came next in `direction` becomes active; counters
  unchanged. `false` when absent.

An extra turn (a Checkers multi-jump) needs no helper: the caller does not
advance.

`TurnCycler` keeps its public surface and behaviour (AC6). Its `advance()`
builds a `TurnOrder<EntityId>` from the `controlled` tag order and the
`activeTurn` holder, calls `advanceTurn`, and writes the tags back. Its 0- and
1-entity results stay `true` as today. Speed / energy scheduling stays the
backlog's untriaged `TurnCycler` row.

README: plain `TurnOrder` first (seats in a JSON state, hot-seat play), then
`TurnCycler` as the world wrapper.

## Checklist

### Part A — plain pile helpers

- [ ] Add `pile-array.ts` with `moveTop`, `moveAll`, `moveItem` and JSDoc;
  export them and `MoveAllOptions` from `src/modules/pile/index.ts`.
- [ ] Add `pile-array.test.ts` covering AC1–AC2: order, clamping, `count`
  truncation, `from === to`, `reverse`, object items, absent item.
- [ ] Rename world `moveTop` / `moveAll` to `movePileTop` / `movePileAll` in
  `pile.ts` and `pile.test.ts`; migrate `examples/solitaire` and
  `examples/card-battler` (`grep -rn "moveTop\|moveAll" examples` is empty
  afterwards except plain-helper uses).
- [ ] Rewrite `src/modules/pile/README.md` (plain first, world second; runnable
  samples compile under `scripts/doc-samples.test.ts`).
- [ ] `npm run docs:api && npm run docs:usage`; full gate (AC7).

Visible after: `@pierre/ecs/modules/pile` works on plain arrays; solitaire and
card-battler play as before.
Needs you: nothing.

### Part B — plain turn order

- [ ] Add `turn-order.ts` with the type and helpers above, with JSDoc; export
  from `src/modules/turn-based/index.ts`.
- [ ] Add `turn-order.test.ts` covering AC4–AC5: forward and reversed wraps,
  `skip` crossing the wrap (including `skip >= seats.length`), one seat, no
  seats, `passTurnTo`, add/remove before, at and after the active seat, JSON
  round-trip.
- [ ] Re-implement `TurnCycler.advance()` over `advanceTurn`; existing
  `turn-cycler.test.ts` untouched and green (AC6).
- [ ] Rewrite `src/modules/turn-based/README.md` (plain first, `TurnCycler`
  second).
- [ ] `npm run docs:api && npm run docs:usage`; full gate (AC7).

Visible after: `@pierre/ecs/modules/turn-based` exposes `TurnOrder`; the
roguelike plays as before.
Needs you: nothing.

## Finishing

The decision is already in [decisions.md](../decisions.md#discrete-game-logic-is-plain-data-first-components-second).
Delete this plan in the final commit. BoardGames uses neither module today, so
no downstream break.
