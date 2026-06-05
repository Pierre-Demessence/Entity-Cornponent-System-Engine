# `@pierre/ecs/modules/timer`

A small, embeddable **countdown value** — the shared timing primitive
behind `modules/lifetime`, `modules/cooldown`, and (later)
`modules/spawner`. Canon: Bevy's `Timer`/`Time`, Unity `WaitForSeconds`,
Unreal `FTimerManager`.

`Timer` is a **value**, not a component or system. Embed it wherever a
countdown belongs — as a flat component (its fields are all primitives, so
`timerSchema` plugs straight into `simpleComponent`) or as a field on game
state (e.g. a global spawn cadence). Because it is a value, an entity can
hold several independent timers (a lifetime *and* a fire cooldown) without
collision.

## API

```ts
type TimerMode = 'once' | 'repeating';

interface Timer {
  remainingMs: number;
  durationMs: number;
  mode: TimerMode;
  justFinished: boolean;
}

const timerSchema: SimpleSchema<Timer>;

function makeTimer(durationMs: number, mode?: TimerMode): Timer;
function tickTimer(t: Timer, dtMs: number): void;
function finished(t: Timer): boolean;
function justFinished(t: Timer): boolean;
function fraction(t: Timer): number;       // elapsed [0,1]; remaining = 1 - fraction
function restart(t: Timer, durationMs?: number): void;
```

- **`once`** counts down, clamps to zero, and *latches* — `finished` stays
  true; `justFinished` is true only on the crossing tick.
- **`repeating`** wraps on reaching zero (multiple wraps in one tick
  coalesce into a single `justFinished`); `finished` reports the per-tick
  wrap edge.

## Usage

### As a flat component field-set

```ts
import { timerSchema, type Timer } from '@pierre/ecs/modules/timer';
import { simpleComponent } from '@pierre/ecs';

type Charge = Timer;
const ChargeDef = simpleComponent<Charge>('charge', timerSchema);
```

### As plain game-state (global cadence)

```ts
import { makeTimer, tickTimer, justFinished } from '@pierre/ecs/modules/timer';

state.spawnTimer = makeTimer(1500, 'repeating');
// each frame:
tickTimer(state.spawnTimer, dtMs);
if (justFinished(state.spawnTimer)) spawnEnemy();
```

Import via `@pierre/ecs/modules/timer`. Depends on core only (`SimpleSchema`).
