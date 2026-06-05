# `@pierre/ecs/modules/rng`

Pure, domain-neutral randomness utilities: a seedable generator,
integer/array helpers, and an in-place Fisher–Yates shuffle. No ECS
coupling — just functions over a `RandomFn`.

Canon pattern: Unity `Random` / Godot `RandomNumberGenerator` (seedable),
lodash `shuffle`, every roguelike's seeded RNG.

## API

```ts
type RandomFn = () => number;                                  // [0, 1), like Math.random

function makeSeededRng(seed: number): RandomFn;                // mulberry32, deterministic
function randomInt(maxExclusive: number, rand?: RandomFn): number;   // [0, maxExclusive)
function pick<T>(arr: readonly T[], rand?: RandomFn): T | undefined;  // undefined if empty
function shuffle<T>(arr: T[], rand?: RandomFn): T[];           // in-place, returns arr
```

Every consumer of randomness takes an optional `rand` (default
`Math.random`). Pass a `makeSeededRng(seed)` to get reproducible shuffles
and picks for replays and deterministic tests.

## Examples

```ts
import { makeSeededRng, pick, shuffle } from '@pierre/ecs/modules/rng';

// Non-deterministic (Math.random)
shuffle(deck);
const target = pick(enemies);

// Deterministic replay / test
const rng = makeSeededRng(12345);
shuffle(deck, rng);
```

`makeSeededRng` is fast and stateless-per-instance but **not**
cryptographically secure — don't use it for anything security-sensitive.
