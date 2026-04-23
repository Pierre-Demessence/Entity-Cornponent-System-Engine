import type { InputProvider, InputRawEvent } from '#input-source';

/**
 * Frozen record of pointer-button codes, sibling to `Key`. Use
 * `Pointer.LeftButton` inside a `createInput` map to bind a mouse
 * button alongside keyboard keys:
 *
 * ```ts
 * createInput({
 *   fire: [Key.Space, Pointer.LeftButton],
 * }, [keyboard, pointer]);
 * ```
 *
 * Button numbers follow the DOM `PointerEvent.button` convention
 * (0 = primary, 1 = middle, 2 = secondary). Passing raw strings still
 * works; custom providers (gamepad, touch extensions) are free to
 * emit their own codes.
 */
export const Pointer = {
  LeftButton: 'Pointer.Left',
  MiddleButton: 'Pointer.Middle',
  RightButton: 'Pointer.Right',
} as const;

export type PointerCode = typeof Pointer[keyof typeof Pointer];

type PointerButton = 0 | 1 | 2;

function isPointerButton(n: number): n is PointerButton {
  return n === 0 || n === 1 || n === 2;
}

const BUTTON_CODE: Record<PointerButton, PointerCode> = {
  0: Pointer.LeftButton,
  1: Pointer.MiddleButton,
  2: Pointer.RightButton,
};

/**
 * Live, read-only view of the pointer's continuous state. Consumers
 * read this every tick (or every render frame) to drive aim vectors,
 * cursor rendering, or hover-affected UI. Writes are owned by the
 * provider; the type is `readonly` by contract.
 */
export interface PointerState {
  /** Raw viewport-space X coordinate (`PointerEvent.clientX`). */
  readonly clientX: number;
  /** Raw viewport-space Y coordinate (`PointerEvent.clientY`). */
  readonly clientY: number;
  /** True iff the pointer is currently over the target. */
  readonly over: boolean;
  /** X coordinate in target-local space (see projector doc). */
  readonly x: number;
  /** Y coordinate in target-local space (see projector doc). */
  readonly y: number;
}

/**
 * Custom coordinate projector: given a raw `PointerEvent` and the
 * target element, return the `{x, y}` the consumer wants stored on
 * `PointerState`. Override when the default canvas-aware projection
 * doesn't suit (e.g. translating to SVG user-units, applying a
 * camera transform, or integrating with CSS transforms).
 */
export type PointerProjector = (
  ev: PointerEvent,
  target: PointerTarget,
) => { x: number; y: number };

/**
 * Structural target interface: any object exposing DOM event-target
 * semantics plus `getBoundingClientRect`. Real consumers pass an
 * `HTMLElement` (canvas, div, etc.). Tests can pass a minimal stub.
 */
export interface PointerTarget extends EventTarget {
  getBoundingClientRect: () => {
    readonly height: number;
    readonly left: number;
    readonly top: number;
    readonly width: number;
  };
}

export interface PointerProviderOptions {
  /**
   * Buttons to emit as digital events. Defaults to `[0, 1, 2]`
   * (left, middle, right). Pass an empty array to disable button
   * reporting while still tracking position.
   */
  buttons?: readonly PointerButton[];
  /**
   * Seed position used before the first `pointermove`. Handy for
   * games that want the aim vector to start at the screen centre
   * rather than `(0, 0)`. Ignored if omitted — `state.x` / `state.y`
   * default to `0`.
   */
  initialPosition?: { x: number; y: number };
  /**
   * Whether to call `preventDefault()` on the native context-menu
   * event. Defaults to `true` when button 2 is reported (so
   * right-click can be used as a game action without the browser
   * popping up a menu). Set to `false` if the consumer wants the
   * native menu, or handles it elsewhere.
   */
  preventContextMenu?: boolean;
  /**
   * Coordinate projector. Default behaviour:
   *   - If `target` looks like an `HTMLCanvasElement` (has numeric
   *     `width`/`height` properties), scale
   *     `clientX/Y - rect.left/top` by `canvas.width / rect.width`
   *     (and analogously for Y) so the reported position is in
   *     canvas-internal pixel coordinates even when the canvas is
   *     CSS-scaled.
   *   - Otherwise, return `clientX - rect.left` / `clientY - rect.top`
   *     (target-local pixels).
   */
  project?: PointerProjector;
  /**
   * Element (or structural equivalent) to attach pointer listeners
   * to. In real apps this is the canvas / game container. The
   * provider needs `getBoundingClientRect` for coordinate
   * projection.
   */
  target: PointerTarget;
  /**
   * EventTarget that receives the `pointerup` listener so button
   * releases outside the target still register. Defaults to
   * `window` when available. Pass an explicit target for headless
   * environments (tests).
   */
  windowTarget?: EventTarget | null;
}

function defaultProject(ev: PointerEvent, target: PointerTarget): { x: number; y: number } {
  const rect = target.getBoundingClientRect();
  const localX = ev.clientX - rect.left;
  const localY = ev.clientY - rect.top;
  const maybeCanvas = target as { height?: unknown; width?: unknown };
  if (
    typeof maybeCanvas.width === 'number'
    && typeof maybeCanvas.height === 'number'
    && rect.width > 0
    && rect.height > 0
  ) {
    return {
      x: localX * (maybeCanvas.width / rect.width),
      y: localY * (maybeCanvas.height / rect.height),
    };
  }
  return { x: localX, y: localY };
}

/**
 * DOM pointer adapter. Reports button down/up events as raw
 * `InputRawEvent`s keyed by `Pointer.*` codes (so they plug into
 * `createInput` action maps identically to keyboard codes) and
 * exposes a continuous position surface on `this.state`.
 *
 * Position tracking uses Pointer Events, which unify mouse, touch,
 * and pen inputs — single-touch "just works" without a separate
 * touch provider. Multi-touch and gestures are out of scope in v1.
 *
 * Buttons that release outside the target still fire `up` events
 * because the `pointerup` listener is attached to the window; this
 * matches how real games want held-button state to behave
 * (releasing LMB off-canvas should stop firing).
 */
export class PointerProvider implements InputProvider {
  private readonly buttonSet: Set<PointerButton>;
  private readonly handlers = new Set<(raw: InputRawEvent) => void>();
  private readonly onContextMenu: (e: Event) => void;
  private readonly onPointerDown: (e: Event) => void;
  private readonly onPointerEnter: (e: Event) => void;
  private readonly onPointerLeave: (e: Event) => void;
  private readonly onPointerMove: (e: Event) => void;
  private readonly onPointerUp: (e: Event) => void;
  private readonly preventContextMenu: boolean;
  private readonly project: PointerProjector;
  readonly state: PointerState;
  private readonly target: PointerTarget;
  private readonly windowTarget: EventTarget | null;
  private readonly writableState: {
    over: boolean;
    clientX: number;
    clientY: number;
    x: number;
    y: number;
  };

  constructor(options: PointerProviderOptions) {
    this.target = options.target;
    this.project = options.project ?? defaultProject;
    const buttons = options.buttons ?? ([0, 1, 2] as const);
    this.buttonSet = new Set(buttons);
    this.preventContextMenu
      = options.preventContextMenu ?? this.buttonSet.has(2);
    this.writableState = {
      clientX: 0,
      clientY: 0,
      over: false,
      x: options.initialPosition?.x ?? 0,
      y: options.initialPosition?.y ?? 0,
    };
    this.state = this.writableState;
    this.windowTarget
      = options.windowTarget === undefined
        ? (typeof window !== 'undefined' ? window : null)
        : options.windowTarget;

    this.onPointerMove = (e: Event): void => {
      const pe = e as PointerEvent;
      const p = this.project(pe, this.target);
      this.writableState.clientX = pe.clientX;
      this.writableState.clientY = pe.clientY;
      this.writableState.x = p.x;
      this.writableState.y = p.y;
    };
    this.onPointerEnter = (): void => {
      this.writableState.over = true;
    };
    this.onPointerLeave = (): void => {
      this.writableState.over = false;
    };
    this.onPointerDown = (e: Event): void => {
      const pe = e as PointerEvent;
      const p = this.project(pe, this.target);
      this.writableState.clientX = pe.clientX;
      this.writableState.clientY = pe.clientY;
      this.writableState.x = p.x;
      this.writableState.y = p.y;
      if (!isPointerButton(pe.button) || !this.buttonSet.has(pe.button))
        return;
      this.emit({ code: BUTTON_CODE[pe.button], kind: 'down' });
    };
    this.onPointerUp = (e: Event): void => {
      const pe = e as PointerEvent;
      const p = this.project(pe, this.target);
      this.writableState.clientX = pe.clientX;
      this.writableState.clientY = pe.clientY;
      this.writableState.x = p.x;
      this.writableState.y = p.y;
      if (!isPointerButton(pe.button) || !this.buttonSet.has(pe.button))
        return;
      this.emit({ code: BUTTON_CODE[pe.button], kind: 'up' });
    };
    this.onContextMenu = (e: Event): void => {
      if (this.preventContextMenu)
        e.preventDefault();
    };

    this.target.addEventListener('pointermove', this.onPointerMove);
    this.target.addEventListener('pointerenter', this.onPointerEnter);
    this.target.addEventListener('pointerleave', this.onPointerLeave);
    this.target.addEventListener('pointerdown', this.onPointerDown);
    this.windowTarget?.addEventListener('pointerup', this.onPointerUp);
    this.target.addEventListener('contextmenu', this.onContextMenu);
  }

  dispose(): void {
    this.target.removeEventListener('pointermove', this.onPointerMove);
    this.target.removeEventListener('pointerenter', this.onPointerEnter);
    this.target.removeEventListener('pointerleave', this.onPointerLeave);
    this.target.removeEventListener('pointerdown', this.onPointerDown);
    this.windowTarget?.removeEventListener('pointerup', this.onPointerUp);
    this.target.removeEventListener('contextmenu', this.onContextMenu);
    this.handlers.clear();
  }

  private emit(raw: InputRawEvent): void {
    for (const h of this.handlers)
      h(raw);
  }

  subscribe(handler: (raw: InputRawEvent) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }
}
