# `@pierre/ecs/modules/input`

Action-map + edge-detected input state with pluggable raw-event providers.
Ships a DOM `KeyboardProvider` out of the box; custom providers (gamepad,
touch, synthetic test harness) plug in by implementing the tiny
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
  dispose(): void;     // unsubscribes and disposes every provider
}

function createInput<TAction extends string>(
  map: InputMap<TAction>,
  providers: readonly InputProvider[],
): InputState<TAction>;

class KeyboardProvider implements InputProvider {
  constructor(options?: {
    target?: EventTarget;              // defaults to window
    preventDefaultCodes?: readonly string[]; // omit = preventDefault every mapped code
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

## Scope

- "Tick boundary" is caller-defined — the module deliberately does not
  self-register with a `TickRunner`. Consumers call `clearEdges()`
  wherever they want edge resolution (logic tick, render frame, manual
  turn advance, test harness).
- OS-level key repeat is filtered twice: `KeyboardProvider` drops events
  with `event.repeat`, and `createInput` additionally dedupes repeated
  `down` events per code.
- No axis/analog support in v1. Gamepad sticks + mouse deltas are a
  future Path-A addition once a real consumer lands.
- No global `preventDefault` toggling — pass an explicit list (or empty
  array) via `KeyboardProvider` options to control it.
