/**
 * Pointer-lock relative look: while the pointer is captured, report how far it
 * moved since the previous motion event — as radians, ready to add to a yaw /
 * pitch pair.
 *
 * This is the third shape this module ships, next to `InputProvider`'s discrete
 * down/up stream and `PointerProvider`'s absolute position surface: it owns the
 * pointer-lock lifecycle and emits a *relative* channel. It deliberately does
 * not own yaw / pitch — clamping, sign conventions and camera semantics stay
 * with the consumer.
 */

/** Relative motion since the previous event, already scaled by `sensitivity`. */
export interface LookDelta {
  /** Yaw delta in radians. Positive means the pointer moved right. */
  readonly x: number;
  /** Pitch delta in radians. Positive means down, unless `invertY` is set. */
  readonly y: number;
}

/** Read-only view of the provider's lock state, owned by the provider. */
export interface MouseLookState {
  /** True while `target` holds the pointer lock. */
  readonly locked: boolean;
}

/**
 * The element to capture — an `HTMLElement` (usually the canvas) in a browser.
 * Headless environments may omit the DOM methods entirely; the provider then
 * never *captures*. Whether it reports a lock is a question for `lockSource`.
 */
export interface MouseLookTarget extends EventTarget {
  style?: { cursor: string };
  requestPointerLock?: () => Promise<void> | void;
}

/**
 * Document-like source of lock state: the provider listens here for
 * `pointerlockchange` / `pointermove` and asks it which element is locked.
 *
 * Injectable because jsdom ships no pointer-lock API — tests pass a plain
 * `EventTarget` with `pointerLockElement` assigned.
 */
export interface LockSource extends EventTarget {
  pointerLockElement: Element | null;
  exitPointerLock?: () => void;
}

/** Options for {@link MouseLookProvider}. */
export interface MouseLookOptions {
  /**
   * Cursor CSS while locked and unlocked. Omit to leave the cursor alone — the
   * provider then never touches `target.style`.
   */
  cursor?: { readonly locked: string; readonly unlocked: string };
  /** Invert the vertical axis, flight-style. Default `false`. */
  invertY?: boolean;
  /** Lock-state source. Defaults to the global `document` when present. */
  lockSource?: LockSource | null;
  /** Radians per CSS pixel of relative motion. Default `0.0022`. */
  sensitivity?: number;
  /** Element to capture. */
  target: MouseLookTarget;
}

const DEFAULT_SENSITIVITY = 0.0022;

/**
 * Reports relative pointer motion while the pointer is locked to `target`, and
 * tracks the lock itself. It binds no input gesture of its own — the consumer
 * calls `requestLock()` from whichever click should capture.
 *
 * Mirrors `PointerProvider`'s split: a `subscribe` channel for the continuous
 * signal, plus a read-only `state` for the discrete flag. That flag is the one
 * thing a consumer cannot derive from the delta stream, which is why it is
 * exposed rather than left to `document.pointerLockElement` reads.
 *
 * Motion is ignored while an element other than `target` holds the lock — an
 * overlay, or a second provider capturing the same pointer — so it cannot
 * steer the camera.
 */
export class MouseLookProvider {
  private readonly cursor: MouseLookOptions['cursor'];
  private disposed = false;
  private readonly handlers = new Set<(delta: LookDelta) => void>();
  private readonly invertY: boolean;
  private readonly lockSource: LockSource | null;
  private readonly onLockChange: () => void;
  private readonly onMotion: (e: Event) => void;
  private readonly sensitivity: number;
  readonly state: MouseLookState;
  private readonly target: MouseLookTarget;
  private readonly writableState: { locked: boolean };

  constructor(options: MouseLookOptions) {
    this.target = options.target;
    this.cursor = options.cursor;
    this.invertY = options.invertY ?? false;
    this.sensitivity = options.sensitivity ?? DEFAULT_SENSITIVITY;
    this.lockSource
      = options.lockSource === undefined
        ? (typeof document === 'undefined' ? null : document as LockSource)
        : options.lockSource;
    this.writableState = { locked: false };
    this.state = this.writableState;

    this.onMotion = (e: Event): void => {
      if (!this.isLocked())
        return;
      const me = e as MouseEvent;
      const x = (me.movementX ?? 0) * this.sensitivity;
      const y = (me.movementY ?? 0) * this.sensitivity * (this.invertY ? -1 : 1);
      if (x === 0 && y === 0)
        return;
      for (const handler of this.handlers)
        handler({ x, y });
    };
    this.onLockChange = (): void => {
      this.writableState.locked = this.isLocked();
      this.applyCursor();
    };

    this.lockSource?.addEventListener('pointermove', this.onMotion);
    this.lockSource?.addEventListener('pointerlockchange', this.onLockChange);

    this.writableState.locked = this.isLocked();
    this.applyCursor();
  }

  private applyCursor(): void {
    if (!this.cursor || !this.target.style)
      return;
    this.target.style.cursor
      = this.writableState.locked ? this.cursor.locked : this.cursor.unlocked;
  }

  /**
   * Detach every listener and release the lock. Idempotent: afterwards the
   * provider is inert — a second `dispose()`, `requestLock()` and `unlock()` are
   * all no-ops, and a handler registered later never fires. Restores the
   * unlocked cursor before releasing, because the lock-change listener is gone
   * by the time the browser confirms the exit.
   */
  dispose(): void {
    if (this.disposed)
      return;
    this.disposed = true;
    this.lockSource?.removeEventListener('pointermove', this.onMotion);
    this.lockSource?.removeEventListener('pointerlockchange', this.onLockChange);
    this.handlers.clear();
    this.writableState.locked = false;
    this.applyCursor();
    this.release();
  }

  private isLocked(): boolean {
    if (!this.lockSource)
      return false;
    const locked: EventTarget | null = this.lockSource.pointerLockElement;
    return locked !== null && locked === this.target;
  }

  /**
   * Unfenced release, so `dispose()` can still let go once it has made the
   * provider inert.
   */
  private release(): void {
    if (!this.isLocked())
      return;
    this.lockSource?.exitPointerLock?.();
  }

  /**
   * Ask the browser to capture the pointer. No-op when already captured or
   * disposed, and when there is no lock source to observe the result —
   * capturing blind could strand the pointer with no way to release it.
   *
   * The capture *gesture* is the consumer's to bind: doom fires on the same
   * mousedown that captures (and must not fire on it), while portal must not
   * capture on the right click that fires an orange portal. So the provider
   * exposes the action and leaves the trigger to the app.
   */
  requestLock(): void {
    if (this.disposed || !this.lockSource || this.isLocked())
      return;
    try {
      // The promise rejects when the gesture is denied or not user-initiated.
      // Swallow it: there is nothing actionable, and an unhandled rejection
      // would surface as a console error on a perfectly ordinary click.
      void Promise.resolve(this.target.requestPointerLock?.()).catch(() => undefined);
    }
    catch {
      // Older engines throw synchronously instead of rejecting.
    }
  }

  /**
   * Subscribe to relative motion. Returns an unsubscribe function. Deltas are
   * delivered at event time, so a consumer that applies them immediately gets
   * motion between ticks rather than quantised to the tick rate.
   *
   * A motion event carrying no delta (or a zero `sensitivity`) emits nothing.
   */
  subscribe(handler: (delta: LookDelta) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /**
   * Release the pointer lock. No-op when not captured or already disposed.
   *
   * The DOM confirms the release asynchronously, so an `unlock()` followed by a
   * `dispose()` in the same tick requests the exit twice — redundant, but the
   * end state is the same, and tracking the in-flight release would cost more
   * state than the saved call is worth.
   */
  unlock(): void {
    if (this.disposed)
      return;
    this.release();
  }
}
