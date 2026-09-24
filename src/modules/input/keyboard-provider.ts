import type { InputProvider, InputRawEvent } from '#input-source';

/**
 * Which `KeyboardEvent` field supplies the emitted `code`.
 *
 * - `'code'` (default) — physical key position, labelled after US-QWERTY. It
 *   is layout-independent, which is what WASD-style movement wants.
 * - `'key'` — the produced character. Required for layout-typed symbols such
 *   as `>` (Shift+Period on a US layout), which `.code` cannot express
 *   without explicit modifier tracking. The browser reports `key` against the
 *   modifier state *at event time*, so the value can differ between the
 *   `keydown` and `keyup` of one physical key (release Shift before Period
 *   and the `keyup` reports `'.'`, not `'>'`). The provider therefore pairs
 *   each release with the value its own `keydown` emitted, falling back to
 *   the event's own field when no `keydown` was observed. Two consequences
 *   follow from the value being the identity: a release is only paired if its
 *   `keyup` is observed (a blur or tab switch swallows it, leaving the action
 *   down until the same key is pressed and released again), and two physical
 *   keys producing one character (both Shift keys, `Numpad1` and `Digit1`) are
 *   one input.
 */
export type KeyboardEmitSource = 'code' | 'key';

export interface KeyboardProviderOptions {
  /**
   * Field supplying the emitted `code`. Defaults to `'code'`.
   */
  emit?: KeyboardEmitSource;
  /**
   * Set of emitted values that should `event.preventDefault()` when
   * handled — matched against the same field `emit` selects, so the list
   * reads like the input map it belongs to. Leaving it `undefined` means
   * the provider prevents the browser default for every value it emits.
   * Pass an empty array to disable prevention entirely.
   */
  preventDefaultCodes?: readonly string[];
  /**
   * Target to attach listeners to. Defaults to `window` so global
   * keyboard input works without extra wiring. Pass a focused canvas
   * or element to scope input.
   */
  target?: EventTarget;
}

/**
 * DOM keyboard adapter. Emits raw `down`/`up` events keyed by either
 * `KeyboardEvent.code` (default) or `KeyboardEvent.key` — see
 * `KeyboardProviderOptions.emit`. Filters OS key-repeat at the DOM layer via
 * `event.repeat`; the shared translation layer additionally dedupes.
 */
export class KeyboardProvider implements InputProvider {
  private readonly downValues = new Map<string, string>();
  private readonly emitSource: KeyboardEmitSource;
  private readonly handlers = new Set<(raw: InputRawEvent) => void>();
  private readonly onKeyDown: (e: Event) => void;
  private readonly onKeyUp: (e: Event) => void;
  private readonly preventAll: boolean;
  private readonly preventSet: Set<string>;
  private readonly target: EventTarget;

  constructor(options: KeyboardProviderOptions = {}) {
    const target = options.target ?? (typeof window !== 'undefined' ? window : null);
    if (!target) {
      throw new Error(
        'KeyboardProvider: no target available. Pass options.target explicitly '
        + '(e.g. the window from your DOM environment) when window is undefined.',
      );
    }
    this.target = target;
    this.emitSource = options.emit ?? 'code';
    this.preventAll = options.preventDefaultCodes === undefined;
    this.preventSet = new Set(options.preventDefaultCodes ?? []);
    this.onKeyDown = (e: Event): void => {
      const ke = e as KeyboardEvent;
      if (ke.repeat)
        return;
      const value = this.valueFor(ke);
      this.downValues.set(ke.code, value);
      // Prevention is decided by the provider's own config, so it happens
      // before dispatch — a throwing handler cannot skip it.
      if (this.shouldPrevent(value))
        ke.preventDefault();
      this.dispatch({ code: value, kind: 'down' });
    };
    this.onKeyUp = (e: Event): void => {
      const ke = e as KeyboardEvent;
      // `key` can change between down and up (modifier released first), so the
      // release reuses the value its own keydown emitted.
      const value = this.downValues.get(ke.code) ?? this.valueFor(ke);
      this.downValues.delete(ke.code);
      if (this.shouldPrevent(value))
        ke.preventDefault();
      this.dispatch({ code: value, kind: 'up' });
    };
    this.target.addEventListener('keydown', this.onKeyDown);
    this.target.addEventListener('keyup', this.onKeyUp);
  }

  private dispatch(raw: InputRawEvent): void {
    for (const h of this.handlers)
      h(raw);
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.downValues.clear();
    this.handlers.clear();
  }

  private shouldPrevent(value: string): boolean {
    return this.preventAll || this.preventSet.has(value);
  }

  subscribe(handler: (raw: InputRawEvent) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  private valueFor(event: KeyboardEvent): string {
    return this.emitSource === 'key' ? event.key : event.code;
  }
}
