# Plan — `modules/input` V2: pointer-lock relative look

Ship the relative-look provider three 3D examples hand-roll. Backlog entry:
`modules/input` V2 (deferred, trigger **MET** — 3 consumers).

## Dual-sided verification (2026-09-22)

**Engine — ABSENT.** A grep of `src/modules/input` finds no `movementX`, no
pointer lock, no yaw. `modules/input` ships `KeyboardProvider`,
`PointerProvider`, `GamepadProvider`; `PointerProvider` reports *absolute*
`PointerState` (`clientX/clientY/x/y`), which is a different capability, not a
flag on it.

**Consumers — three, all hand-rolled.**

- **doom** `main.ts:113-122` — guard `document.pointerLockElement !== target`,
  `yaw -= movementX * MOUSE_SENSITIVITY`, `pitch -= movementY * ...`, symmetric
  `±MAX_PITCH` clamp. Lock requested inside `onMouseDown` (`main.ts:123-131`),
  rejection swallowed via `Promise.resolve(...).catch(() => undefined)`
  (`main.ts:110-112`). No `pointerlockchange` listener; cursor set once
  (`main.ts:30`).
- **portal** `main.ts:104-113` — **character-for-character identical** to doom's
  five update lines. Same swallowing (`main.ts:99-103`), same missing
  lock-change listener, same one-shot cursor (`main.ts:36`).
- **platformer-3d** `main.ts:86-90` — yaw only (`cameraYaw`), no pitch, no
  clamp; `pointermove` on the **canvas** rather than `document`; the only
  example with a `pointerlockchange` listener (`main.ts:91-94`, toggling
  `'grab'` ↔ `'none'`). Its `requestLock` **claims** to swallow the rejection
  (`main.ts:81-85`) but does not — a live unhandled-rejection bug when a gesture
  is denied.

**Constraint that picks the shape.** `portal`'s teleport system *writes*
`ctx.yaw` / `ctx.pitch` in place after a portal crossing
(`systems/teleport.ts:76-78`), and `yaw`/`pitch` are read by `render.ts`,
`systems/input.ts`, `systems/weapon.ts`, `systems/carry.ts` and
`systems/portal-gun.ts`. The state fields must therefore stay the source of
truth in the app, so the provider must not own yaw/pitch.

## Decision record

**Decision.** The provider owns the **pointer-lock lifecycle + relative-motion
accumulation**, and emits **sensitivity-scaled deltas at event time** through a
`subscribe(handler)` channel. It does **not** own yaw/pitch.

**Options considered.**

1. *Provider owns yaw/pitch* (three.js `PointerLockControls` shape). Removes the
   clamp code too, but forces `ctx.yaw` → `ctx.look.state.yaw` across ~10 files
   per example, gives `portal`'s teleport a read-modify-write, and collides with
   the 3D group's `modules/camera-3d`, which is where the backlog already homes
   "the rig family — first-person look, orbit, third-person chase". Rejected:
   two future owners of the yaw/pitch concept is exactly the failure mode
   `AGENTS.md` names.
2. *Poll-accumulated deltas per tick* (Unity `Mouse.current.delta` shape).
   Changes when look is applied (tick time instead of event time), which
   coarsens camera motion on the three examples that apply it per event.
   Rejected: behaviour change for no consumer benefit.
3. **Chosen:** event-time scaled deltas via `subscribe`, mirroring the existing
   `InputProvider.subscribe(handler)` shape, plus a `state` surface for the lock
   flag, mirroring `PointerProvider.state`. Consumers keep their `ctx.yaw`
   fields, so `portal`'s teleport write and every reader are untouched.

A tick-poll form is composable from `subscribe` in two lines, so it is
deliberately not shipped.

**Amendment after the consumer inventory.** A fourth option was drafted and
then dropped: letting the provider bind the capture gesture itself
(`requestOn: 'pointerdown' | 'click' | 'none'`). The inventory killed it —
doom's capturing mousedown is entangled with firing (`main.ts:123-131`: it fires
only when already locked) and portal's right click must fire an orange portal
without capturing (`main.ts:114-122`). Any provider-chosen gesture either
over-captures (right click) or needs a button filter to match. Since a gesture
that "usually shares a click with something else" is app UX, the provider
rejects the option and exposes `requestLock()` instead — one call from each
consumer's own handler.

## API

```ts
type LookDelta = { readonly x: number; readonly y: number };  // radians, already scaled
interface MouseLookState { readonly locked: boolean }
interface MouseLookTarget extends EventTarget {
  requestPointerLock?: () => void | Promise<void>;
  style?: { cursor: string };
}
interface LockSource extends EventTarget {          // document-like
  pointerLockElement: Element | null;
  exitPointerLock?: () => void;
}
interface MouseLookOptions {
  target: MouseLookTarget;
  sensitivity?: number;                     // rad per CSS px, default 0.0022
  invertY?: boolean;                        // default false
  cursor?: { locked: string; unlocked: string };  // omit = leave the cursor alone
  lockSource?: LockSource | null;           // default: global `document`
}

class MouseLookProvider {
  readonly state: MouseLookState;
  subscribe(handler: (delta: LookDelta) => void): () => void;
  requestLock(): void;                      // the capture gesture stays app-owned
  unlock(): void;
  dispose(): void;                          // detach listeners + release the lock
}
```

Injection points exist because jsdom has no pointer-lock API: tests pass an
`EventTarget` with `pointerLockElement` assigned, matching the existing
`pointer-provider.test.ts` style.

## Tasks

- [x] `src/modules/input/mouse-look.ts` — the provider, types, rejection-swallowing
      `requestLock`, lock-change handling with optional cursor CSS.
- [x] `src/modules/input/index.ts` — export the new symbols (alphabetical).
- [x] `src/modules/input/mouse-look.test.ts` — lock lifecycle, guard while
      unlocked, sensitivity scaling, `invertY`, cursor toggle, unsubscribe,
      dispose, missing-API tolerance.
- [x] `src/modules/input/README.md` — document the provider and why it is not an
      `InputProvider`.
- [x] Migrate doom (`main.ts`) — keep the fire handlers, drop `requestLock`/`onMouseMove`.
- [x] Migrate portal (`main.ts`) — same; `yaw`/`pitch` fields and teleport untouched.
- [x] Migrate platformer-3d (`main.ts`) — cursor toggle moves to the `cursor` option.
- [x] `npm run docs:api`; backlog entry → shipped (drop it and its trigger row,
      and the `3 pointer-lock look` line in the 3D group's demand tally).
- [x] `npm test` + `npm run lint` clean; `tsc --noEmit` clean per migrated example.
- [x] Peer review to LGTM.

## Invariants

- Module depends on core primitives only; no import from `@pierre/ecs` or a
  sibling module.
- Deltas are **scaled by `sensitivity`** before delivery, so a consumer reads
  radians. `invertY` flips only the Y component.
- Motion is ignored unless `lockSource.pointerLockElement === target`.
- The provider binds **no gesture of its own**: it never attaches a listener to
  `target`, only to the lock source.
- `requestLock` never produces an unhandled rejection (fixes platformer-3d's
  latent bug), and never throws when the DOM lacks the pointer-lock API.
- `dispose()` is idempotent and leaves the lock released; the provider never
  throws when the DOM lacks the pointer-lock API.

## Behaviour preservation

All three migrations are behaviour-preserving, verified against the inventory:

- **doom** keeps its fire handlers and its rule that the capturing click does not
  fire (now read from `look.state.locked`, which is equivalent because the flag
  updates on `pointerlockchange` — exactly when `document.pointerLockElement`
  changes). Its `mousedown`-only capture is preserved by calling `requestLock()`
  from the same button-0 branch rather than accepting any pointerdown.
- **portal** keeps LMB capture-and-fire and its rule that RMB never captures.
  Its `yaw`/`pitch` fields, and `systems/teleport.ts`'s in-place write, are
  untouched.
- **platformer-3d** keeps the `click` gesture and the `'grab'` ↔ `'none'` cursor
  toggle (now the `cursor` option), and gains one fix: its lock request previously
  claimed to swallow a denied-gesture rejection but did not (`main.ts:81-85`).

Typechecked per example (`npx tsc --noEmit` in each), not just linted — lint is
not type-aware for the examples.

## Review outcome (2026-09-22)

The first pass found no correctness bug, no regression and no invariant
violation, and verdicted all three migrations PRESERVED. Two non-blocking items
were both fixed:

- The "binds no gesture of its own" test dispatched only on the captured
element, so it could not catch a provider listening for a capture gesture on the
*lock source* — the shape the pre-migration examples actually used. It now
dispatches on both targets.
- `dispose()` was idempotent only in the weak sense: a second call re-issued
`exitPointerLock()` while the DOM still reported the lock. It now carries a
`disposed` flag, which also stops a torn-down provider capturing the pointer, and
the test pins the exit call to exactly one.

Nits applied from the same pass: a docblock naming a DOM type that does not
exist (`PointerLockTarget`), a class summary that said the provider captures the
pointer (the generated catalog truncates at that line, so it was the only thing
readers would see), the "another tab" rationale for the identity guard, and the
undocumented zero-delta suppression. The same pass noted the one thing static
review cannot settle: that a real browser delivers `movementX/Y` on
`pointermove` under pointer lock (the pre-migration platformer-3d already relied
on exactly that, so the risk is low, but it is a playtest question).

A second pass found two more, both fixed:

- `unlock()` was not fenced by the new `disposed` flag, so a torn-down provider
  could still issue an exit call — the exact asymmetry the flag exists to
  prevent. It is now fenced behind a private unfenced `release()`, so `dispose()`
  can still let go once it has made the provider inert.
- The README kept the "another tab" rationale that pass one asked to drop, while
  this plan claimed the nit was applied. Corrected, and the README now states the
  inert-after-dispose contract and the lock-source requirement.

Also from that pass: `requestLock()` now refuses when there is no lock source,
because capturing without a way to observe the lock could strand the pointer, and
a test pins that a missing `movementY` reads as `0` rather than `NaN`.

A third pass tightened three statements that overreached: "a child frame" (an
iframe is a separate document and never reaches the lock source), the jsdom half
of the lock-source bullet (`document` exists there, so the default source is
non-null and merely never observes a lock), and the inert-after-dispose list,
which omitted that handlers registered after disposal never fire. It also flagged
that `unlock()` immediately followed by `dispose()` can request the exit twice —
the DOM confirms asynchronously, so the second request is redundant rather than
wrong — and that fence is now pinned by a test.

A fourth pass returned LGTM, with only doc-precision notes: the headless sentence
on `MouseLookTarget` named the wrong cause (lock *reporting* depends on the lock
source, not the target), the identity-guard rationale described a dispatch-origin
check the code does not perform (it compares the lock holder), and the README
referred to a `camera-3d` module that is still a backlog row. All three, plus an
interface summary for `MouseLookOptions` so the generated catalog renders one,
are applied.
