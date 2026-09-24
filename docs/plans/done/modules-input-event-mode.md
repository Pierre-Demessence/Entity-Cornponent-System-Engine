# Plan: `modules/input` event-mode dispatch

**Status:** implemented; verified locally — awaiting commit

## Why this, now

Backlog entry: `docs/roadmap/ecs-module-backlog.md` § "`modules/input`
event-mode variant — **ready**" (that entry is deleted by this change, since
the backlog holds open work only). Ready means the *shape* is proven and the
only thing missing is a build slot; it is not waiting on evidence.

**Canon.** Every major engine ships event dispatch alongside polled state:

| Engine | Polled | Event |
| --- | --- | --- |
| Godot | `Input.is_action_pressed` | `_input` / `_unhandled_input` signals |
| Unity | `Input.GetKey` | `Input.GetKeyDown` edges, `InputSystem` `performed` callbacks |
| Phaser | polled key objects | `keydown` / `keyup` events |

**Consumers.** The shipped `createInput` is poll-on-tick, calibrated for
real-time games (snake, asteroids, platformer). Turn-based consumers are the
gap:

- `Roguelike/src/ui/input.ts:5` — `KEY_MAP` keyed by `KeyboardEvent.key`
  (`','` `.` `>` `g`), returning a payload-carrying `ActionType`. One
  keypress = one turn; there is no tick to poll. **Evidence only** — see the
  repo-boundary rule below.
- Ladder games **#13 Tic-Tac-Toe** and **#18 Worms** are turn-based.

### Repo boundary

The Roguelike is a sibling repository. Its input layer is read here as
*evidence for the shape*, never as a migration target: no file outside this
repo is created or edited by this plan. Roguelike's adoption is its own work
in its own repo, and is tracked there. In-repo consumers are the only ones
this repo migrates, and this change has none.

## Scope

**In.** An `EventInput<TAction>` factory that wires the existing
`InputProvider` contract to the existing `InputMap` and *dispatches* on the
down/up action edge, plus the `KeyboardProvider` option needed to map
layout-typed characters.

**Out — and where each lives instead.**

- Action → payload mapping. The roguelike maps `'ArrowDown'` to
  `{ type: 'move', dx: 0, dy: 1 }`; that is an app command table. The engine
  emits the *action name* only. Keeps `src/modules/input` domain-neutral.
- Turn-boundary queueing. Dispatch is synchronous (see D4); a consumer that
  wants to process a command at turn start enqueues in its own handler.
- Wheel deltas + multi-touch — separate backlog entry, own shape gate.
- Rebinding / modifier registry — `core-engine-roadmap.md` §4.5.
- A typed `KeyName` const for `KeyboardEvent.key` values — raw strings are
  fine for the handful of codes a turn-based consumer maps; revisit if a
  consumer asks.
- **Roguelike adoption** — out of repo. Deliberately not tracked from here:
  it is not an example-surfaced gap, so the gap ledger is the wrong home,
  and the shipped backlog entry leaves the backlog.

## Design decisions

**D1 — Dispatch, not polling.** `EventInput` has no `clearEdges`, no
`isDown`. A subscriber is called as the edge happens.

**D2 — Action-level edges, identical to `createInput`.** Down fires when an
action goes from zero aliased keys down to at least one; up fires when the
last one releases. OS key-repeat is deduped. The semantics are not
re-derived — they are *shared*: extract the code→actions index and the
down-count/edge bookkeeping into one internal module used by both
`input-state.ts` and `event-input.ts`, so the two modes cannot drift.

**D3 — `KeyboardProvider` gains `emit: 'code' | 'key'` (default `'code'`).**
`InputRawEvent.code` is documented as a *provider-defined* string keyed by
`KeyboardEvent.code` "for keyboards", so a provider emitting
`KeyboardEvent.key` is inside the existing contract — no core change.
Required because `>` is Shift+Period on a US layout: with `.code` it would
need explicit modifier tracking, with `.key` it is one character, which is
what the roguelike's map relies on. *Rejected:* adding a `key` field to the
core `InputRawEvent` union — a core-contract change for a provider-local
need, and it would also touch the deferred wheel entry that reasons about
that same union.

**D4 — Synchronous dispatch at DOM event time.** Canon matches: Godot's
`_input` runs outside `_process`. Documented explicitly, because it means a
handler runs mid-tick if a key arrives mid-tick. Consumers needing
determinism enqueue and drain at their own boundary.

**D5 — Payload stays app-side.** See Scope.

**D6 — Naming mirrors the shipped factory.** `createEventInput` /
`EventInput<TAction>` beside `createInput` / `InputState<TAction>`, with the
same `unsubscribe` / `dispose` split (dispose also disposes providers).

## Probable shape

```ts
export interface InputEvent<TAction extends string> {
  action: TAction;
  kind: 'down' | 'up';
}

export interface EventInput<TAction extends string> {
  dispose(): void;      // unsubscribe + dispose every provider
  subscribe(handler: (ev: InputEvent<TAction>) => void): () => void;
  unsubscribe(): void;  // detach from providers without disposing them
}

export function createEventInput<TAction extends string>(
  map: InputMap<TAction>,
  providers: readonly InputProvider[],
): EventInput<TAction>;
```

`subscribe` is the whole surface — per-action sugar (`onDown(a, fn)`) is
added only when a consumer asks for it.

## Files

| File | Change |
| --- | --- |
| `src/modules/input/action-tracker.ts` | **new** — code→actions index + down-count/edge bookkeeping, internal (not re-exported) |
| `src/modules/input/event-input.ts` | **new** — `createEventInput` + `EventInput` |
| `src/modules/input/event-input.test.ts` | **new** — tests, reusing the `FakeProvider` pattern from `input.test.ts` |
| `src/modules/input/input-state.ts` | use `action-tracker` (behaviour-preserving) |
| `src/modules/input/keyboard-provider.ts` | add `emit` option |
| `src/modules/input/input.test.ts` | cover both emit modes (the `keyboardProvider` block lives here, not in a file of its own) |
| `src/modules/input/index.ts` | export `createEventInput`, `EventInput`, `InputEvent` |
| `src/modules/input/README.md` | new "Event mode" section + when to use which |
| `docs/agent/engine-api.md` | regenerate via `npm run docs:api` |
| `docs/roadmap/ecs-module-backlog.md` | delete the shipped entry + its status-at-a-glance row |

No `package.json` change: `modules/input` already ships as a subpath export.

## Verification gates

- `npm run lint`, `npm test`, `npm run typecheck`.
- `npm run docs:api` must be re-run (the drift test `scripts/engine-api.test.ts`
  fails `npm test` otherwise).
- No example is touched, so `npm run typecheck:examples` is unaffected.
- Nothing outside this repo is touched (see Repo boundary).
- `emit: 'code'` remains the default → no behaviour change for existing
  consumers; the DOM-facing change still warrants one manual keyboard check.
- Peer-review loop via subagent (reviewer must not edit code, must not use
  `vscode_askQuestions`) until it returns no actionable items.
- E2E: Pierre owns playtesting. No example is modified by this change, so
  the hand-off is the keyboard check above, not a game playtest.

## Deferred, with durable homes already

- Wheel deltas + multi-touch → `docs/roadmap/ecs-module-backlog.md`
  § "`modules/input` — wheel + multi-touch".
- Rebinding registry → `docs/roadmap/core-engine-roadmap.md` §4.5.
- Payload/command tables → per-consumer app code (no doc needed; not engine work).
- Roguelike adoption → the Roguelike repo, when that work is scheduled there.

## Review outcome

Three peer-review rounds. Round 1 found one real defect and it changed the
design:

- **`emit: 'key'` could permanently wedge an action.** The browser reports
  `key` against the modifier state *at event time*, so Shift+Period emits
  `'>'` on keydown but `'.'` on keyup if Shift is released first. The tracker
  then saw no `up` for `'>'`, kept it in its down set, and swallowed every
  later `down` — with no reset available in event mode. Fixed by having
  `KeyboardProvider` pair each release with the value its own `keydown`
  emitted (`downValues`, keyed by the stable `event.code`). That also covers
  "hold Period, press Shift mid-hold, release".
- Prevention moved **before** dispatch, so a throwing handler cannot skip
  `preventDefault`.
- `createEventInput` snapshots its handler list per event, matching the
  canonical emitter behaviour (Node's `EventEmitter` copies the listener
  array): handlers added mid-dispatch do not receive the in-flight edge, and
  handlers removed mid-dispatch still do.
- Docs: the `emit: 'key'` caveats (value-as-identity; an unobserved `keyup`)
  are now stated rather than implied, and three stale README claims were
  corrected.

Rounds 2 and 3 returned no blocking findings; the loop closed at LGTM.

## Checklist

- [x] Extract `action-tracker.ts` from `input-state.ts`; `input.test.ts`
      still green with no test edits (69 tests)
- [x] Add `KeyboardProvider({ emit })` + tests for both modes
- [x] Implement `createEventInput` / `EventInput` + tests
      (aliases, action-level edges, OS-repeat dedupe, `unsubscribe` vs `dispose`,
      multiple providers on one map)
- [x] Export from `src/modules/input/index.ts`
- [x] Update `src/modules/input/README.md` (API block, event-mode section,
      key-vs-code guidance, synchronous-dispatch caveat)
- [x] `npm run docs:api`
- [x] Delete the shipped backlog entry + glance row
- [x] Peer review to LGTM (3 rounds; round-1 fixes above)
- [x] Move this plan to `docs/plans/done/` in the same commit as the change
