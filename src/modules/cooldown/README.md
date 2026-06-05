# `@pierre/ecs/modules/cooldown`

Per-entity action-gating cooldown — fire-rate limits, ability recharge,
invulnerability i-frames. A `'once'` `Timer` (see `modules/timer`) that
starts **ready** and is re-armed on use. Canon: any engine's fire-rate /
ability-cooldown timer; the "gate you poll" half of the timing primitive
(`modules/lifetime` is the "auto-fire on finish" half).

## API

```ts
type Cooldown = Timer;            // from modules/timer, mode 'once', starts ready

const CooldownDef: ComponentDef<Cooldown>;

function makeCooldown(durationMs: number): Cooldown;   // starts ready
function ready(c: Cooldown): boolean;
function trigger(c: Cooldown, durationMs?: number): void;

interface CooldownTickCtx { dtMs: number; world: EcsWorld }
interface CooldownSystemOptions { name?: string; runAfter?: string[] }

function makeCooldownSystem<TCtx extends CooldownTickCtx>(
  options?: CooldownSystemOptions,
): SchedulableSystem<TCtx>;
```

`makeCooldownSystem` advances every `CooldownDef` each tick. Consumers
**poll** `ready(c)` to decide whether the gated action may fire, and call
`trigger(c)` to re-arm it. Unlike `lifetime`, nothing auto-fires — the
cooldown is a gate, not an emitter.

## Usage

```ts
import {
  CooldownDef, makeCooldown, makeCooldownSystem, ready, trigger,
} from '@pierre/ecs/modules/cooldown';

world.registerComponent(CooldownDef);
// Tick cooldowns before the systems that poll `ready()`, so a cooldown
// armed last frame is decremented before this frame's gate check.
scheduler.add(makeCooldownSystem());

// give the player a 180ms fire cooldown, ready immediately
world.getStore(CooldownDef).set(playerId, makeCooldown(180));

// in a later system (added after the cooldown system):
const cd = world.getStore(CooldownDef).get(playerId)!;
if (input.isDown('fire') && ready(cd)) {
  spawnBullet();
  trigger(cd);
}
```

Import via `@pierre/ecs/modules/cooldown`. Depends on `modules/timer`.
