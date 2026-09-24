# `@pierre/ecs/modules/input`

Action-map + edge-detected input state with pluggable raw-event providers, in
two modes: tick-polled state (`createInput`) and event dispatch
(`createEventInput`). Ships DOM `KeyboardProvider`, `PointerProvider`,
`GamepadProvider` and `MouseLookProvider` out of the box; custom providers
(touch extensions, synthetic test harness) plug in by implementing the tiny
`InputProvider` interface from `@pierre/ecs/input-source`.

Canon pattern: Bevy `bevy_input`, Unity `InputSystem`, Godot `InputMap`.

## Why not just use DOM listeners?

Every prototype (snake, asteroids, platformer) hand-rolled a `keydown`/
`keyup` switch that: (1) mapped keycodes to game actions, (2) aliased
arrows + WASD, (3) tracked edge-triggered "just pressed" for things like
jumping, (4) had to be torn down on unmount. This module extracts that
pattern.

## API

```ts
// @pierre/ecs/input-source — core contract
type InputRawEvent =
  | { kind: 'down'; code: string }
  | { kind: 'up';   code: string };

interface InputProvider {
  subscribe(handler: (raw: InputRawEvent) => void): () => void;
  dispose(): void;
}

// @pierre/ecs/modules/input — state + providers
type InputMap<TAction extends string> = Readonly<Record<TAction, readonly string[]>>;

interface InputState<TAction extends string> {
  isDown(action: TAction): boolean;
  justPressed(action: TAction): boolean;
  justReleased(action: TAction): boolean;
  clearEdges(): void;  // call at tick boundary
  unsubscribe(): void; // detaches this InputState from providers
  dispose(): void;     // unsubscribe + dispose every provider (legacy convenience)
}

function createInput<TAction extends string>(
  map: InputMap<TAction>,
  providers: readonly InputProvider[],
): InputState<TAction>;

// Event mode — same map, edges pushed instead of polled
interface EventInput<TAction extends string> {
  subscribe(handler: (event: InputEvent<TAction>) => void): () => void;
  unsubscribe(): void; // detaches this EventInput from providers
  dispose(): void;     // unsubscribe + dispose every provider
}

type InputEvent<TAction extends string> = {
  action: TAction;
  kind: 'down' | 'up';
};

function createEventInput<TAction extends string>(
  map: InputMap<TAction>,
  providers: readonly InputProvider[],
): EventInput<TAction>;

class KeyboardProvider implements InputProvider {
  constructor(options?: {
    emit?: 'code' | 'key';             // defaults to 'code'
    target?: EventTarget;              // defaults to window
    preventDefaultCodes?: readonly string[]; // omit = preventDefault every value it emits
  });
}

// Ergonomic helpers for DOM `KeyboardEvent.code` values
const Key: { readonly ArrowLeft: 'ArrowLeft'; /* ... all common codes ... */ };
type KeyboardCode = typeof Key[keyof typeof Key];
```

Passing raw strings in `InputMap` still works (custom providers can emit
any code). `Key.*` constants are a zero-runtime-cost ergonomics layer
that gives you IDE autocomplete and compile-time typo protection for the
DOM keyboard provider. Why `.code` and not `.key`? Because `.code` is
labelled after the US-QWERTY physical position — so `Key.KeyW` fires for
the physical top-left letter key on AZERTY, QWERTZ, Dvorak, etc.
Classic "WASD" ergonomics get you for free across every keyboard layout.
A map keyed by *produced characters* instead (`','` `'.'` `'>'`) is the case
`emit: 'key'` exists for — see
[Mapping characters instead of physical keys](#mapping-characters-instead-of-physical-keys).

## Usage

```ts
import { createInput, Key, KeyboardProvider } from '@pierre/ecs/modules/input';

type Action = 'left' | 'right' | 'jump';

const input = createInput<Action>(
  {
    jump:  [Key.Space, Key.ArrowUp, Key.KeyW],
    left:  [Key.ArrowLeft, Key.KeyA],
    right: [Key.ArrowRight, Key.KeyD],
  },
  [new KeyboardProvider()],
);

// In your system:
if (input.justPressed('jump'))
  applyJumpImpulse(ship);
if (input.isDown('left'))
  ship.vx -= ACCEL * dt;

// After running the scheduler for the tick:
input.clearEdges();

// On teardown:
input.dispose();
```

If providers are shared across multiple input maps, call `unsubscribe()`
on individual maps and dispose the shared providers from the owning
composition root.

## Edge semantics

Edges are **action-level**, not code-level:

- `justPressed(a)` fires when the action transitions from zero aliased
  keys down to at least one.
- `justReleased(a)` fires when the last aliased key is released.
- Pressing a second alias while the first is held does **not** re-fire
  `justPressed`.
- `clearEdges()` resets both pressed and released sets; `isDown` is
  unaffected.
- Press-and-release within a single tick window leaves both
  `justPressed` and `justReleased` true until the next `clearEdges`.

## Event mode (no tick to poll)

`createEventInput` takes the same `InputMap` and produces the same
action-level edges as `createInput`, but it *pushes* them to subscribers
instead of exposing sets to poll once per tick. That is the shape turn-based
games need: one keypress is one dispatch, so there is no tick to poll and no
`clearEdges()` to call.

```ts
import { createEventInput, Key, KeyboardProvider } from '@pierre/ecs/modules/input';

type Turn = 'moveUp' | 'moveDown' | 'pickup' | 'descend';

const input = createEventInput<Turn>(
  {
    moveUp:  [Key.ArrowUp],
    moveDown: [Key.ArrowDown],
    pickup:  [Key.KeyG],
    descend: [Key.Period],
  },
  [new KeyboardProvider()],
);

const off = input.subscribe(({ action, kind }) => {
  if (kind !== 'down')
    return;
  queueTurn(TURN_COMMANDS[action]); // your payload table
});

// Later: off() removes that handler; input.dispose() tears down providers too.
```

- **Dispatch is synchronous**, from the provider's own DOM listener — the
  same placement as Godot's `_input`, which runs outside `_process`. A handler
  therefore runs mid-tick if the key arrives mid-tick. A consumer that needs
  commands applied at a turn boundary enqueues inside its handler and drains
  at that boundary; the module deliberately owns no queue.
- **One `down` per press.** OS key-repeat is deduped and a second alias does
  not re-fire while the first is held, so holding an arrow key does not stream
  turns.
- **No `isDown` / `justPressed`.** Edge *reading* is the polled mode's job. If
  a consumer needs hold state, it builds a `createInput` over the same
  providers — the two modes are independent views of one raw-event stream.
- **Payloads stay app-side.** The engine dispatches the action *name*; mapping
  `'moveDown'` to `{ dx: 0, dy: 1 }` is app code. The module has no `dx`/`dy`
  and no notion of a turn.

### Mapping characters instead of physical keys

`KeyboardProvider` emits `KeyboardEvent.code` by default — physical key
position, labelled after US-QWERTY, which is what WASD movement wants. Pass
`emit: 'key'` for the produced character instead:

```ts
new KeyboardProvider({ emit: 'key' });
```

That is what a character-keyed map needs (`','` `.` `>` `g`): `>` is
Shift+Period on a US layout, so `.code` would require explicit modifier
tracking, while `.key` is one character. The browser reports `key` against
the modifier state *at event time*, so the value can differ between a
`keydown` and its `keyup` (release Shift before Period and the `keyup` says
`'.'`); the provider pairs each release with the value its own `keydown`
emitted, falling back to the event's own field when no `keydown` was observed.

Two things follow from the value being the identity, and both are worth
knowing before you key a map by characters:

- **A release is only paired if its `keyup` is observed.** A blur or a tab
  switch swallows it, leaving the action down. The next press *and release*
  of the same physical key under the same modifier state clears it — plain
  `Period` emits `'.'`, so it cannot clear a stranded `'>'`.
- **Two physical keys producing one character are one input** — both Shift
  keys emit `'Shift'`, `Numpad1` and `Digit1` both `'1'`. Releasing either
  ends the action while the other is still held.

`preventDefaultCodes` matches the same field `emit` selects, so the list reads
like the map it belongs to. The `Key.*` constants hold `.code` values, so a
`.key` map uses raw strings.

## Scope

- "Tick boundary" is caller-defined — the module deliberately does not
  self-register with a `TickRunner`. Consumers call `clearEdges()`
  wherever they want edge resolution (logic tick, render frame, manual
  turn advance, test harness).
- OS-level key repeat is filtered twice: `KeyboardProvider` drops events
  with `event.repeat`, and the shared translation layer (both `createInput`
  and `createEventInput`) additionally dedupes repeated `down` events for
  the same emitted value.
- No axis/analog support in `InputState<T>`. Gamepad sticks ship in
  `GamepadProvider` and relative mouse deltas in `MouseLookProvider`;
  action-map state stays cleanly digital.
- No global `preventDefault` toggling — pass an explicit list (or empty
  array) via `KeyboardProvider` options to control it.

## Pointer

`PointerProvider` reports mouse / pen / single-finger-touch input via
the unified DOM [Pointer Events] API. Buttons are emitted as raw
events (plug directly into `createInput` maps), while position lives
on `provider.state` as a continuous surface.

```ts
import {
  createInput,
  Key,
  KeyboardProvider,
  Pointer,
  PointerProvider,
} from '@pierre/ecs/modules/input';

const canvas = document.querySelector('canvas')!;
const keyboard = new KeyboardProvider();
const pointer = new PointerProvider({ target: canvas });

type Action = 'up' | 'down' | 'left' | 'right' | 'fire';
const input = createInput<Action>(
  {
    up:    [Key.KeyW, Key.ArrowUp],
    down:  [Key.KeyS, Key.ArrowDown],
    left:  [Key.KeyA, Key.ArrowLeft],
    right: [Key.KeyD, Key.ArrowRight],
    fire:  [Key.Space, Pointer.LeftButton],
  },
  [keyboard, pointer],
);

// In a system:
const aimX = pointer.state.x;
const aimY = pointer.state.y;
const viewportX = pointer.state.clientX;
const viewportY = pointer.state.clientY;
if (input.isDown('fire'))
  fireBulletToward(aimX, aimY);
```

### Coordinate projection

`PointerState` exposes both coordinate spaces:

- `x` / `y`: projected target-local coordinates (projector output).
- `clientX` / `clientY`: raw viewport coordinates from Pointer Events.

The default projector reports **target-local pixels**. When the target
looks like an `HTMLCanvasElement` (has numeric `width` / `height`), it
additionally scales by `canvas.width / rect.width` so the returned
coordinates are in **canvas-internal pixel space** even when the
canvas is CSS-stretched (high-DPI layouts, fullscreen).

That default projection is also exported as the pure function
`projectPointer(ev, target)` — reach for it when you read the pointer at
**event time** (inside your own `pointerdown`/`pointermove` handlers) instead
of through the tick-read provider, so you share the exact DPI math:

```ts
import { projectPointer } from '@pierre/ecs/modules/input';

canvas.addEventListener('pointerdown', (ev) => {
  const { x, y } = projectPointer(ev, canvas); // canvas backing-pixel coords
});
```

Pass `options.project` to override the provider's projection:

```ts
new PointerProvider({
  target: svg,
  project: (ev, target) => {
    // Translate to SVG user units, for example.
    const pt = (target as SVGSVGElement).createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    const ctm = (target as SVGSVGElement).getScreenCTM();
    const local = ctm ? pt.matrixTransform(ctm.inverse()) : pt;
    return { x: local.x, y: local.y };
  },
});
```

### Button codes

| Code                     | `PointerEvent.button` |
| ------------------------ | :-------------------: |
| `Pointer.LeftButton`     | 0                     |
| `Pointer.MiddleButton`   | 1                     |
| `Pointer.RightButton`    | 2                     |

Use them in `createInput` maps identically to `Key.*`. Restrict which
buttons are emitted with `options.buttons = [0]` (for example).

### Context menu

When button 2 is included in the reported buttons, the provider
`preventDefault()`s the native `contextmenu` event on the target so
right-click can be used as a game action. Override with
`options.preventContextMenu: false`.

### Releases off-target

The `pointerup` listener is attached to `window` (not the target), so
releasing a button while the pointer is outside the canvas still
registers — held-fire state doesn't get stuck. Pass
`options.windowTarget` (e.g. a fresh `EventTarget`) in tests or
headless environments.

### Pointer scope

- v1 is position + over-flag + buttons 0/1/2, nothing else.
- No scroll/wheel and no multi-touch or gesture helpers yet — tracked as a
  deferred gap (`modules/input` — wheel + multi-touch) in the module backlog.
  Every engine ships the *function*, but no two agree on the *shape* (Unity a
  polled `Input.mouseScrollDelta`, Godot a discrete wheel-button event with a
  `factor`, Phaser a `'wheel'` event object), and the core raw-event union
  cannot carry a delta as-is. Pointer lock lives in `MouseLookProvider`
  (below). Single-finger touch already works via Pointer Events.
- Analog position lives on `provider.state`, not inside `InputState<T>`
  — action-map state stays cleanly digital.

[Pointer Events]: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events

## Relative look (pointer lock)

`MouseLookProvider` captures the pointer on request and reports how far it moved
since the previous event, as radians. That makes it a third shape next to the
two above: `InputProvider` carries discrete down/up, `PointerProvider` an
absolute position, and this one a *relative* delta.

```ts
import { MouseLookProvider } from '@pierre/ecs/modules/input';
import { clamp } from '@pierre/ecs/modules/math';

const look = new MouseLookProvider({
  sensitivity: 0.0022, // radians per CSS pixel
  target: canvas,
});

// The capture gesture is yours to bind — it usually shares a click with
// something else (firing, a UI button).
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0)
    look.requestLock();
});

look.subscribe(({ x, y }) => {
  camera.yaw -= x;
  camera.pitch = clamp(camera.pitch - y, -MAX_PITCH, MAX_PITCH);
});

// Teardown detaches every listener and releases the lock.
look.dispose();
```

### Why it is not an `InputProvider`

`InputProvider` emits discrete `down` / `up` events for `createInput` to map to
named actions. Relative look is continuous and has no action to map to, so it
gets its own `subscribe` channel — the same split `PointerProvider` uses for its
position surface, which also sits outside `InputState`.

### Deltas arrive at event time

`subscribe` fires inside the motion handler, not at the tick boundary, so a
consumer that applies the delta immediately gets motion *between* ticks instead
of quantised to the tick rate. A tick-polled form is two lines of composition —
accumulate in the handler, read and zero it in your system — so it is
deliberately not shipped.

### Locking behaviour

- Motion is ignored while an element other than `target` holds the lock — an
  overlay, or a second provider capturing the same pointer — so it cannot steer
  the camera.
- `requestLock()` is a no-op when the lock is already held, and never surfaces an
  unhandled rejection when a browser denies the gesture.
- `dispose()` detaches everything and releases the lock; afterwards the provider
  is inert — a repeat `dispose()`, `requestLock()` and `unlock()` all no-op, and
  a handler registered later never fires.
- The DOM confirms a release asynchronously, so `unlock()` immediately followed
  by `dispose()` may request the exit twice; the second request is redundant.
- `options.cursor = { locked: 'none', unlocked: 'grab' }` swaps the cursor on
  lock change. Omit it and the provider never touches the target's style.
- `options.invertY` flips only the vertical axis.

### Relative-look scope

- `sensitivity` is applied by the provider, so with the documented
  radians-per-pixel value the deltas arrive as radians. It is a bare number, so
  the unit is a convention you choose. The screen-space sign is fixed — `x`
  grows to the right, `y` downward unless `invertY` — but what that means for
  your yaw/pitch is yours: `yaw -= x` and `yaw += x` are both caller choices.
- A motion event carrying no delta emits nothing, so `sensitivity: 0` silences
  the stream entirely rather than emitting zeroes.
- **No yaw/pitch storage.** The provider does not own your camera angles, because
  consumers need to write them too (portal's teleport rewrites yaw/pitch after a
  portal crossing). A first-person camera rig belongs with the planned 3D camera
  module.
- Orbit / turntable look (drag rather than capture) is not here — it is a camera
  rig, not an input source.
- No touch-look and no gyro.
- **A lock source is required.** With `options.lockSource: null` (or in an
  environment with no `document` at all) the provider never reports a lock and
  refuses to capture, because capturing blind could strand the pointer with no
  way to release it.
- jsdom and other headless environments ship no pointer-lock API — `document`
  exists there, so the default lock source is non-null but never reports a lock.
  Pass `options.lockSource` with a `pointerLockElement` property in tests.
