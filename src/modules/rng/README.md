# `@pierre/ecs/modules/rng`

Pure, domain-neutral randomness utilities: a seedable generator whose
position can be saved and restored, number/array helpers, and an in-place
Fisher–Yates shuffle. No ECS coupling — just functions over a `RandomFn`.

## API

```ts
type RandomFn = () => number;                                  // [0, 1), like Math.random
interface SeededRng extends RandomFn { state: number }         // state: JSON-safe uint32, read/write

function makeSeededRng(seed: number): SeededRng;               // mulberry32, deterministic
function randomInt(maxExclusive: number, rand?: RandomFn): number;   // [0, maxExclusive)
function randomFloat(min: number, max: number, rand?: RandomFn): number; // [min, max)
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

## Saving and restoring the sequence

A `SeededRng` is still a plain `RandomFn`, so it drops into every helper
above. Its `state` is a single JSON-safe number: read it to save the
position in the sequence, assign it back to resume from exactly there.

```ts
import { makeSeededRng, randomFloat } from '@pierre/ecs/modules/rng';

const rng = makeSeededRng(12345);
randomFloat(0, 10, rng);

// Save: put the number in your save data.
const saved = JSON.stringify({ rngState: rng.state });

// Load: a fresh generator, then assign the saved state.
const restored = makeSeededRng(0);
restored.state = (JSON.parse(saved) as { rngState: number }).rngState;
randomFloat(0, 10, restored) === randomFloat(0, 10, rng); // true
```

`makeSeededRng` is fast and keeps its state per instance, but it is **not**
cryptographically secure — don't use it for anything security-sensitive.
