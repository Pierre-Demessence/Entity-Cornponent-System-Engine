import type { InputProvider, InputRawEvent } from '#input-source';

export interface KeyboardProviderOptions {
  /**
   * Set of `KeyboardEvent.code` values that should `event.preventDefault()`
   * when handled. Leaving it `undefined` means the provider prevents the
   * browser default for every code it emits. Pass an empty array to
   * disable prevention entirely.
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
 * DOM keyboard adapter. Emits raw `down`/`up` events keyed by
 * `KeyboardEvent.code`. Filters OS key-repeat at the DOM layer via
 * `event.repeat`; the input-state layer additionally dedupes.
 */
export class KeyboardProvider implements InputProvider {
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
    this.preventAll = options.preventDefaultCodes === undefined;
    this.preventSet = new Set(options.preventDefaultCodes ?? []);
    this.onKeyDown = (e: Event): void => {
      const ke = e as KeyboardEvent;
      if (ke.repeat)
        return;
      this.emit({ code: ke.code, kind: 'down' });
      if (this.shouldPrevent(ke.code))
        ke.preventDefault();
    };
    this.onKeyUp = (e: Event): void => {
      const ke = e as KeyboardEvent;
      this.emit({ code: ke.code, kind: 'up' });
      if (this.shouldPrevent(ke.code))
        ke.preventDefault();
    };
    this.target.addEventListener('keydown', this.onKeyDown);
    this.target.addEventListener('keyup', this.onKeyUp);
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.handlers.clear();
  }

  private emit(raw: InputRawEvent): void {
    for (const h of this.handlers)
      h(raw);
  }

  private shouldPrevent(code: string): boolean {
    return this.preventAll || this.preventSet.has(code);
  }

  subscribe(handler: (raw: InputRawEvent) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }
}
