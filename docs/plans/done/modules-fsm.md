# modules/fsm — finite state machine (AI pick #2)

Second AI primitive. Unlike `modules/steering` (strong canon → shipped on
one consumer), FSM has **no unanimous canon** (Unity Animator vs Godot
`AnimationTree`/LimboAI vs Bevy `bevy_state` vs statecharts all differ),
so the **rule of three** applies: prove the shape with a new
`examples/stealth-guard` PoC as the 2nd consumer alongside doom's existing
idle/chase/attack FSM ([doom `ai.ts`](../../examples/doom/src/systems/ai.ts)),
then extract.

## Transition model — (A) per-state update-returns-next

Chosen over table-driven guards (B). Each state is
`{ onEnter?, update(ctx, self) → nextKey | null, onExit? }`; `update`
returns a key to transition or `null` to stay. Matches doom's implicit
FSM, co-locates game logic per state, smallest surface. Canon: *Programming
Game AI by Example* (State pattern), Bevy `bevy_state`, XState (the
callback half).

## Target surface (pure, ECS-decoupled value primitive)

```ts
interface Fsm<TKey extends string> { current: TKey; elapsedMs: number }
interface FsmState<TCtx, TKey extends string> {
  onEnter?: (ctx: TCtx, self: Fsm<TKey>) => void;
  update: (ctx: TCtx, self: Fsm<TKey>) => TKey | null;
  onExit?: (ctx: TCtx, self: Fsm<TKey>) => void;
}
type FsmStates<TCtx, TKey extends string> = Record<TKey, FsmState<TCtx, TKey>>;
function makeFsm<TKey>(initial: TKey): Fsm<TKey>;
function tickFsm<TCtx, TKey>(fsm, states, ctx, dtMs): void; // advance elapsed, update, on transition run exit→enter + reset elapsed
```

Value primitive (like `modules/timer`), **not** an ECS component — the
`states` map holds closures that can't serialise. The app stores the
`Fsm` value however it likes (component field or brain object).

## Open questions the PoC must answer

- **`self` in handlers?** Passing the `Fsm` gives handlers `elapsedMs`
  (time-in-state) + `current`. Confirm it's enough, or whether the entity
  must ride on `ctx`.
- **Same-key return = stay (no re-enter).** Confirm no consumer wants a
  self-transition that re-runs `onEnter`.
- **Composition with steering.** The `chase` state should drive velocity
  via `modules/steering` `seek`; `search`/`return`/`patrol` via `arrive`.
  Proves FSM (brain) + steering (muscles) compose.

## PoC: stealth guard

Guards patrol waypoints; a vision cone + line-of-sight drives a 5-state
FSM: **patrol** → **suspicious** (saw player briefly) → **chase**
(steering `seek`) → **search** (go to last-known pos, look around) →
**return** (walk back to patrol). Player (WASD) sneaks past walls that
block LoS. Exercises enter/exit hooks (reset suspicion on enter; set
search target on enter), time-in-state (suspicion meter, search timeout),
and steering composition.

## Workflow

1. Local `fsm.ts` + guard game in `examples/stealth-guard`.
2. Tune until the guard behaviour reads clearly (state label per guard).
3. Extract `src/modules/fsm/` (+ tests).
4. Migrate the example to consume it. doom is the 2nd consumer at
   extraction — assess whether migrating doom's `ai.ts` is a clean fit or
   a feel-changing non-fit (as top-down-shooter/doom were for steering).

## Checklist

- [x] Plan doc (this file).
- [x] Scaffold `examples/stealth-guard`.
- [x] Local `fsm.ts` (`Fsm`, `makeFsm`, `tickFsm`, `FsmState`/`FsmStates`).
- [x] Guard game: 5-state FSM, vision cone + LoS, walls, player, chase
      composes `modules/steering`.
- [x] Tune until behaviour reads clearly. (Pierre playtested; fixed wall
      sticking via repositioned walls/waypoints + wall-avoidance blended
      through `steering.combine`.)
- [x] Register in `examples/hub`.
- [x] Example `build` + `lint` pass.
- [x] Extract `src/modules/fsm/` (+ colocated tests — 7 tests).
- [x] Regen `engine-api` (drift test green).
- [x] Migrate example → `@pierre/ecs/modules/fsm` (local copy deleted).
- [x] Assess doom `ai.ts` — **clean fit** (update-only subset,
      behaviour-preserving) but migration **deferred** (complex,
      playtest-owned; `AiDef` schema change). Documented in backlog.
- [x] Module README.
- [x] Docs: backlog `modules/fsm` shipped entry + promotion-trigger row.
- [x] Peer review (subagent) — no logic bugs; fixed the README consumer
      claim (doom not yet migrated), added a `tickFsm` contract JSDoc
      (valid-key return, no re-entrancy), + an `onEnter` elapsed-reset
      test. Full suite 965 green.
