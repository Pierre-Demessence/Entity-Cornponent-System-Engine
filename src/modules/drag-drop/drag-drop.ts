import type { Vec2 } from '../math';

/**
 * The state of one drag, from press to drop. All points are in the space the
 * consumer passes to {@link DragDrop} — client pixels, canvas pixels or world
 * units; the session never converts.
 */
export interface DragSession<TPayload> {
  /** Pointer minus the dragged item's origin at the press: where on the item it was grabbed. */
  readonly grab: Vec2;
  /** What is being dragged — an entity id, a list of cards, an inventory slot. */
  readonly payload: TPayload;
  /** The latest pointer. */
  readonly pointer: Vec2;
  /** Where to draw the dragged item's origin now: `pointer − grab`. */
  readonly position: Vec2;
  /** The pointer at the press. */
  readonly press: Vec2;
  /** `false` until the pointer has moved `threshold` away from the press. */
  readonly started: boolean;
}

/**
 * Where a drop is tested: the pointer, the dragged item's origin
 * ({@link DragSession.position}), or any point you derive from the session —
 * the dragged card's centre, say.
 */
export type DragProbe<TPayload> = 'origin' | 'pointer' | ((session: DragSession<TPayload>) => Vec2);

/** Options for {@link DragDrop}. */
export interface DragDropOptions<TPayload, TTarget> {
  /** Where the drop is tested. Default `'pointer'`. */
  probe?: DragProbe<TPayload>;
  /**
   * How far, in the points' units, the pointer must move from the press before
   * the drag starts. Below it, releasing is a click: {@link DragDrop.end}
   * returns `null`. Default `0` — the drag starts at the press.
   */
  threshold?: number;
  /** Whether `target` takes `payload` — the game's move rule. */
  accepts: (target: TTarget, payload: TPayload) => boolean;
  /** Whether `point` is over `target`. */
  contains: (target: TTarget, point: Vec2) => boolean;
  /** Candidate drop targets, highest priority first. Called on every lookup, so it may reflect live state. */
  targets: () => Iterable<TTarget>;
}

/** The outcome of {@link DragDrop.end}: the payload, and where it landed. */
export interface DropResult<TPayload, TTarget> {
  payload: TPayload;
  /** The first target that contains the probe and accepts the payload, or `null` to snap back. */
  target: TTarget | null;
}

class Session<TPayload> implements DragSession<TPayload> {
  readonly grab: Vec2;
  readonly payload: TPayload;
  pointer: Vec2;
  readonly press: Vec2;
  started: boolean;

  constructor(payload: TPayload, press: Vec2, grab: Vec2, threshold: number) {
    this.payload = payload;
    this.press = press;
    this.grab = grab;
    this.pointer = press;
    this.started = threshold <= 0;
  }

  get position(): Vec2 {
    return { x: this.pointer.x - this.grab.x, y: this.pointer.y - this.grab.y };
  }
}

/**
 * One drag-and-drop interaction at a time: grab a payload, follow the pointer,
 * find the target under it that accepts the payload, drop there or snap back.
 *
 * It takes plain points and returns a result. It binds no input listener,
 * captures no pointer and draws nothing, so the same session drives a DOM UI
 * and a canvas board alike: feed it from DOM events, from `modules/input`, or
 * from a tick system, and draw the dragged item at `session.position`.
 */
export class DragDrop<TPayload, TTarget> {
  private current: Session<TPayload> | null = null;
  private readonly options: DragDropOptions<TPayload, TTarget>;
  private readonly probe: DragProbe<TPayload>;
  private readonly threshold: number;

  constructor(options: DragDropOptions<TPayload, TTarget>) {
    this.options = options;
    this.probe = options.probe ?? 'pointer';
    this.threshold = options.threshold ?? 0;
  }

  /**
   * Press on `payload` with the pointer at `pointer`. `origin` is the dragged
   * item's own origin (its top-left, usually), so the item keeps the grab offset
   * instead of jumping to the pointer. Replaces any drag in progress.
   */
  begin(payload: TPayload, pointer: Vec2, origin: Vec2 = pointer): void {
    const press = { x: pointer.x, y: pointer.y };
    const grab = { x: pointer.x - origin.x, y: pointer.y - origin.y };
    this.current = new Session(payload, press, grab, this.threshold);
  }

  /** Abandon the drag in progress without a drop. */
  cancel(): void {
    this.current = null;
  }

  /**
   * Release, optionally at a final `pointer`, and close the session. Returns
   * the drop result, or `null` when no drag was in progress or the pointer
   * never crossed the threshold (a click, not a drag).
   */
  end(pointer?: Vec2): DropResult<TPayload, TTarget> | null {
    if (pointer)
      this.move(pointer);
    const s = this.current;
    this.current = null;
    if (!s?.started)
      return null;
    return { payload: s.payload, target: this.resolve(s) };
  }

  /** The target the item would land on if released now, or `null`. Use it to highlight a drop zone. */
  get hovered(): TTarget | null {
    return this.current?.started ? this.resolve(this.current) : null;
  }

  /** Update the pointer. Does nothing without a drag in progress. */
  move(pointer: Vec2): void {
    const s = this.current;
    if (!s)
      return;
    s.pointer = { x: pointer.x, y: pointer.y };
    if (!s.started && Math.hypot(pointer.x - s.press.x, pointer.y - s.press.y) >= this.threshold)
      s.started = true;
  }

  private probePoint(s: Session<TPayload>): Vec2 {
    if (this.probe === 'pointer')
      return s.pointer;
    if (this.probe === 'origin')
      return s.position;
    return this.probe(s);
  }

  private resolve(s: Session<TPayload>): TTarget | null {
    const point = this.probePoint(s);
    for (const target of this.options.targets()) {
      if (this.options.contains(target, point) && this.options.accepts(target, s.payload))
        return target;
    }
    return null;
  }

  /** The drag in progress, or `null`. */
  get session(): DragSession<TPayload> | null {
    return this.current;
  }
}
