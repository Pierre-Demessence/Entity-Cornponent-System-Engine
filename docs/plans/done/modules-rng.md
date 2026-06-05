# Plan — `modules/rng` (Local→Engine migration #2)

Pull the hand-rolled shuffle / random-pick out of three examples into a
pure, domain-neutral `@pierre/ecs/modules/rng`. Backlog entry: `modules/rng`
(MET, 3 consumers). Ledger row: B6.

## Dual-sided verification (2026-07-15)

Engine: no RNG util ships (`src/` has none). Consumers hand-roll:

- **card-battler** [`game.ts:83`](../../examples/card-battler/src/game.ts) `shuffleInPlace<T>(arr, random=Math.random)` (Fisher–Yates, already injectable) + [`game.ts:170`](../../examples/card-battler/src/game.ts) `pickRandomFromTag` (pick from a tag set).
- **solitaire** [`game.ts:114`](../../examples/solitaire/src/game.ts) `shuffle(deck)` (Fisher–Yates, in place) + [`main.ts:135`](../../examples/solitaire/src/main.ts) random pick from an array.
- **snake** [`game.ts:53`](../../examples/snake/src/game.ts) `randomEmptyCell` → random pick from an array.

## API

```ts
type RandomFn = () => number;                                  // [0,1)
function makeSeededRng(seed: number): RandomFn;                // mulberry32, deterministic
function randomInt(maxExclusive: number, rand?: RandomFn): number;
function pick<T>(arr: readonly T[], rand?: RandomFn): T | undefined;
function shuffle<T>(arr: T[], rand?: RandomFn): T[];           // in-place Fisher–Yates, returns arr
```

`rand` defaults to `Math.random`. Pure functions, no ECS coupling.

## Tasks

- [x] `src/modules/rng/rng.ts` — implement the 4 fns + `RandomFn` type.
- [x] `src/modules/rng/index.ts` — barrel.
- [x] `src/modules/rng/rng.test.ts` — determinism (seeded), shuffle is a
      permutation, pick in-range, empty-array handling.
- [x] `src/modules/rng/README.md` — API + canon.
- [x] Migrate card-battler (`shuffleInPlace`→`shuffle`, `pickRandomFromTag`→`pick`).
- [x] Migrate solitaire (`shuffle`→engine, `main.ts` pick→`pick`).
- [x] Migrate snake (`randomEmptyCell` pick→`pick`).
- [x] `vitest run` + `eslint` clean (engine + 3 examples).
- [x] Docs: queue #2 → done; ledger B6 → Resolved; backlog `modules/rng` → shipped.
- [x] Peer review (subagent), fix findings.

## Invariants

- Module depends on **core primitives only** — actually zero core imports
  (pure math/array). No import from `@pierre/ecs` or sibling modules.
- Auto-exported via the `"./modules/*"` wildcard — no `package.json` edit.
- Tests colocated (`rng.test.ts` next to `rng.ts`).
