# `@pierre/ecs/modules/spawner`

Cadence emitter — "emit something every *T* ms", where *T* may be fixed, a
difficulty ramp, or jittered. The repeating sibling of `modules/timer`: where
a `Timer` is a single countdown, a `Spawner` fires an emit callback every
interval and reschedules itself. Canon: pipe/obstacle spawners, enemy waves,
auto-fire weapons, bomb drops.

## API

```ts
interface Spawner {
  remainingMs: number;                    // counts down; <=0 emits + reschedules
  readonly nextIntervalMs: () => number;  // fixed | ramp | jitter, per cycle
  readonly active?: () => boolean;        // optional gate
}
interface SpawnerOptions { active?: () => boolean }

function makeSpawner(nextIntervalMs: () => number, options?: SpawnerOptions): Spawner;
function tickSpawner(s: Spawner, dtMs: number, emit: () => void): void;
function resetSpawner(s: Spawner, remainingMs?: number): void;
```

`tickSpawner` advances the cadence by `dtMs`, calling `emit` once per elapsed
interval (drain-all). Overshoot carries into the next cycle so the rate stays
drift-free. `nextIntervalMs()` is called lazily — just before the first emit
and after every emit — so one provider covers a constant, an `elapsed`-based
ramp, or a randomized jitter. Because it never runs at construction, a provider
may safely read game state that is wired up *after* the spawner (e.g. a field
on the very `state` object that owns it). A non-positive interval halts emission
for that tick (infinite-loop guard), as does a hard per-tick cap of 10,000
emits.

The optional `active` gate, while closed, holds the spawner reset and emits
nothing; it fires on the first tick after reopening (e.g. an auto-fire weapon
that only shoots while a button is held).

## Usage

```ts
import { makeSpawner, tickSpawner } from '@pierre/ecs/modules/spawner';

// difficulty-ramped enemy spawner owned by game state
state.enemySpawner = makeSpawner(() => currentSpawnInterval(state.elapsedMs));

// in a spawn system:
tickSpawner(state.enemySpawner, ctx.dtMs, () => spawnEnemyAtEdge(ctx));
```

## Relationship to `modules/timer`

A `Spawner` owns its own signed accumulator rather than embedding a `Timer`:
once-mode `Timer` clamps overshoot to zero on finish, and repeating-mode wraps
with a *fixed* duration — neither supports a fresh per-cycle interval with
drift-free overshoot carry, which the ramp/jitter consumers require. The two
are conceptual siblings (single countdown vs. repeating cadence), not a
code-reuse layering.

Import via `@pierre/ecs/modules/spawner`. A pure value object — depends on
nothing.
