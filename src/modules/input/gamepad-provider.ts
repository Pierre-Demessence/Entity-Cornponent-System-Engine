import type { InputProvider, InputRawEvent } from '#input-source';

/**
 * Frozen record of Web Gamepad codes emitted by {@link GamepadProvider},
 * sibling to `Key` and `Pointer`. Use inside a `createInput` map to bind a
 * controller alongside keyboard/pointer:
 *
 * ```ts
 * createInput({
 *   confirm: [Key.Enter, Gamepad.A],
 *   up: [Key.ArrowUp, Gamepad.DpadUp, Gamepad.LeftStickUp],
 * }, [keyboard, gamepad]);
 * ```
 *
 * Button codes follow the W3C "Standard Gamepad" mapping. Analog sticks are
 * converted to four digital direction codes each (past the deadzone). Passing
 * raw strings still works; this const is purely an ergonomics layer.
 */
export const Gamepad = {
  A: 'Gamepad.A',
  B: 'Gamepad.B',
  Back: 'Gamepad.Back',
  DpadDown: 'Gamepad.DpadDown',
  DpadLeft: 'Gamepad.DpadLeft',
  DpadRight: 'Gamepad.DpadRight',
  DpadUp: 'Gamepad.DpadUp',
  Guide: 'Gamepad.Guide',
  LeftBumper: 'Gamepad.LeftBumper',
  LeftStick: 'Gamepad.LeftStick',
  LeftStickDown: 'Gamepad.LeftStickDown',
  LeftStickLeft: 'Gamepad.LeftStickLeft',
  LeftStickRight: 'Gamepad.LeftStickRight',
  LeftStickUp: 'Gamepad.LeftStickUp',
  LeftTrigger: 'Gamepad.LeftTrigger',
  RightBumper: 'Gamepad.RightBumper',
  RightStick: 'Gamepad.RightStick',
  RightStickDown: 'Gamepad.RightStickDown',
  RightStickLeft: 'Gamepad.RightStickLeft',
  RightStickRight: 'Gamepad.RightStickRight',
  RightStickUp: 'Gamepad.RightStickUp',
  RightTrigger: 'Gamepad.RightTrigger',
  Start: 'Gamepad.Start',
  X: 'Gamepad.X',
  Y: 'Gamepad.Y',
} as const;

export type GamepadCode = typeof Gamepad[keyof typeof Gamepad];

/** Standard-mapping button index → emitted code. */
const BUTTON_CODES: readonly GamepadCode[] = [
  Gamepad.A,
  Gamepad.B,
  Gamepad.X,
  Gamepad.Y,
  Gamepad.LeftBumper,
  Gamepad.RightBumper,
  Gamepad.LeftTrigger,
  Gamepad.RightTrigger,
  Gamepad.Back,
  Gamepad.Start,
  Gamepad.LeftStick,
  Gamepad.RightStick,
  Gamepad.DpadUp,
  Gamepad.DpadDown,
  Gamepad.DpadLeft,
  Gamepad.DpadRight,
  Gamepad.Guide,
];

/** Axis index → [negativeCode, positiveCode]. Up/left are negative. */
const AXIS_CODES: readonly (readonly [GamepadCode, GamepadCode])[] = [
  [Gamepad.LeftStickLeft, Gamepad.LeftStickRight],
  [Gamepad.LeftStickUp, Gamepad.LeftStickDown],
  [Gamepad.RightStickLeft, Gamepad.RightStickRight],
  [Gamepad.RightStickUp, Gamepad.RightStickDown],
];

/**
 * Minimal structural view of a `Gamepad` snapshot — only the fields the
 * provider reads. Real consumers get this from `navigator.getGamepads()`;
 * tests can pass a plain object.
 */
export interface GamepadSnapshot {
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
  readonly connected: boolean;
}

/**
 * Returns the current per-slot gamepad snapshots (nulls for empty slots).
 * Defaults to `navigator.getGamepads()`; inject a stub for tests/headless.
 */
export type GamepadSource = () => readonly (GamepadSnapshot | null)[];

export interface GamepadProviderOptions {
  /**
   * Analog button activation threshold (triggers). A button counts as down
   * when `pressed` is true OR its analog `value` reaches this. Default `0.5`.
   */
  buttonThreshold?: number;
  /**
   * Stick magnitude past which an axis direction becomes digitally "down".
   * Filters resting drift. Range 0–1, default `0.35`.
   */
  deadzone?: number;
  /**
   * Snapshot source. Defaults to `navigator.getGamepads()` when available, and
   * to a no-op (always empty) source otherwise — gamepad input is optional, so
   * construction never throws on a missing `navigator`.
   */
  source?: GamepadSource;
}

function defaultSource(): GamepadSource {
  if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function')
    return () => navigator.getGamepads();
  return () => [];
}

/**
 * Web Gamepad API adapter. Unlike the event-driven keyboard/pointer providers,
 * gamepads are poll-only: the consumer must call {@link GamepadProvider.poll}
 * once per frame/tick. `poll()` diffs the current digital state (buttons +
 * deadzoned stick directions) against the previous snapshot and emits raw
 * `down`/`up` edges keyed by `Gamepad.*` codes — the same contract every other
 * provider uses, so it drops straight into `createInput([keyboard, gamepad])`.
 *
 * State is unioned across all connected controllers (any pad can drive any
 * action), which is the right default for single-player.
 */
export class GamepadProvider implements InputProvider {
  private readonly buttonThreshold: number;
  private readonly deadzone: number;
  private readonly handlers = new Set<(raw: InputRawEvent) => void>();
  private prevActive = new Set<string>();
  private readonly source: GamepadSource;

  constructor(options: GamepadProviderOptions = {}) {
    this.deadzone = options.deadzone ?? 0.35;
    this.buttonThreshold = options.buttonThreshold ?? 0.5;
    this.source = options.source ?? defaultSource();
  }

  private collectAxes(pad: GamepadSnapshot, active: Set<string>): void {
    for (let i = 0; i < AXIS_CODES.length; i++) {
      const value = pad.axes[i];
      if (value === undefined)
        continue;
      const [neg, pos] = AXIS_CODES[i];
      if (value <= -this.deadzone)
        active.add(neg);
      else if (value >= this.deadzone)
        active.add(pos);
    }
  }

  private collectButtons(pad: GamepadSnapshot, active: Set<string>): void {
    for (let i = 0; i < BUTTON_CODES.length; i++) {
      const btn = pad.buttons[i];
      if (btn && (btn.pressed || btn.value >= this.buttonThreshold))
        active.add(BUTTON_CODES[i]);
    }
  }

  dispose(): void {
    this.handlers.clear();
    this.prevActive.clear();
  }

  private emit(raw: InputRawEvent): void {
    for (const h of this.handlers)
      h(raw);
  }

  /**
   * Samples every connected controller and emits `down`/`up` edges for any
   * code whose digital state changed since the last call. Call once per
   * frame. Cheap no-op when nothing is connected.
   */
  poll(): void {
    const pads = this.source();
    const active = new Set<string>();
    for (const pad of pads) {
      if (!pad || !pad.connected)
        continue;
      this.collectButtons(pad, active);
      this.collectAxes(pad, active);
    }
    for (const code of active) {
      if (!this.prevActive.has(code))
        this.emit({ code, kind: 'down' });
    }
    for (const code of this.prevActive) {
      if (!active.has(code))
        this.emit({ code, kind: 'up' });
    }
    this.prevActive = active;
  }

  subscribe(handler: (raw: InputRawEvent) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }
}
