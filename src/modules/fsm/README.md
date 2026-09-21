# `@pierre/ecs/modules/fsm`

A tiny finite-state machine: a serialisable runtime value (`Fsm`) plus a
per-tick `tickFsm` that dispatches to a state table of closures. The
machine holds only `current` + `elapsedMs` (time-in-state); the
*behaviour* — transitions and side effects — lives in an `FsmStates` map
the app owns, exactly like a system.

No canon library dictates one FSM shape (Unity `Animator`, Godot
`AnimationTree`/LimboAI, Bevy `bevy_state`, XState all differ), so this
ships the smallest useful surface. The strong consumer is
[`examples/stealth-guard`](../../../examples/stealth-guard/) — a 5-state
guard brain (patrol→suspicious→chase→search→return) that exercises the
whole surface (enter/exit hooks + `elapsedMs` time-in-state) and composes
`modules/steering` in its `chase` state. doom's idle/chase/attack enemy
AI is a fitting second consumer (it maps onto the `update`-only subset)
but has not been migrated yet.

## Transition model — per-state `update` returns next

Each state's `update` returns the next state key to transition, or `null`
to stay. Returning the *same* key also stays (no re-enter). `onEnter` /
`onExit` fire on transition boundaries — reset a timer, pick a target.
`update`/`onEnter`/`onExit` all receive `self` (the `Fsm`) for
`elapsedMs` and `current`.

## API

```ts
interface Fsm<TKey extends string> { current: TKey; elapsedMs: number }
interface FsmState<TCtx, TKey extends string> {
  onEnter?: (ctx: TCtx, self: Fsm<TKey>) => void;
  onExit?: (ctx: TCtx, self: Fsm<TKey>) => void;
  update: (ctx: TCtx, self: Fsm<TKey>) => TKey | null;
}
type FsmStates<TCtx, TKey extends string> = Record<TKey, FsmState<TCtx, TKey>>;

function makeFsm<TKey>(initial: TKey): Fsm<TKey>;
function tickFsm<TCtx, TKey>(fsm, states, ctx, dtMs): void;
```

`tickFsm` order each tick: `elapsedMs += dtMs` → `update` → on a returned
key, `onExit` (old) → switch + reset `elapsedMs` → `onEnter` (new).

## Usage

```ts
type State = 'patrol' | 'chase';
const states: FsmStates<GameCtx, State> = {
  patrol: {
    update: (ctx) => (ctx.canSeeTarget ? 'chase' : null),
  },
  chase: {
    onEnter: (ctx) => { ctx.alarm(); },
    update: (ctx, self) => {
      if (!ctx.canSeeTarget && self.elapsedMs > 2000) return 'patrol';
      return null;
    },
  },
};

const fsm = makeFsm<State>('patrol');
// each tick, per entity:
tickFsm(fsm, states, ctx, dtMs);
```

## Notes

- **Value primitive, not a component.** Like `modules/timer`, `Fsm` is a
  plain value — the `states` map holds closures that can't serialise. Put
  the `Fsm` value wherever you like (a component field, a controller
  object). No ECS coupling; zero dependencies.
- **Single-machine.** `tickFsm` advances one machine. To drive many
  entities, loop them and call `tickFsm` per entity, supplying per-entity
  context (e.g. set `ctx.currentEntity` before each call). This keeps the
  `states` table shared and stateless.
- **Composes with movement.** The FSM is the *brain* (which behaviour);
  pair it with `@pierre/ecs/modules/steering` for the *muscles* — e.g. a
  `chase` state whose handler drives velocity via `seek`.
