import type { InputProvider, InputRawEvent } from '#input-source';
import type { KeyboardProviderOptions } from './keyboard-provider';

import { beforeEach, describe, expect, it } from 'vitest';

import { createInput } from './input-state';
import { KeyboardProvider } from './keyboard-provider';

class FakeProvider implements InputProvider {
  disposed = false;
  private readonly handlers = new Set<(raw: InputRawEvent) => void>();

  dispose(): void {
    this.disposed = true;
    this.handlers.clear();
  }

  emit(raw: InputRawEvent): void {
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

type Action = 'left' | 'right' | 'jump';

describe('createInput', () => {
  let provider: FakeProvider;

  beforeEach(() => {
    provider = new FakeProvider();
  });

  it('tracks isDown per action from raw events', () => {
    const input = createInput<Action>(
      { jump: ['Space'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'] },
      [provider],
    );

    expect(input.isDown('left')).toBe(false);
    provider.emit({ code: 'ArrowLeft', kind: 'down' });
    expect(input.isDown('left')).toBe(true);
    provider.emit({ code: 'ArrowLeft', kind: 'up' });
    expect(input.isDown('left')).toBe(false);
  });

  it('fires justPressed on first code for an action, not again on the second alias', () => {
    const input = createInput<Action>(
      { jump: [], left: ['ArrowLeft', 'KeyA'], right: [] },
      [provider],
    );

    provider.emit({ code: 'ArrowLeft', kind: 'down' });
    expect(input.justPressed('left')).toBe(true);
    input.clearEdges();
    expect(input.justPressed('left')).toBe(false);

    provider.emit({ code: 'KeyA', kind: 'down' });
    expect(input.justPressed('left')).toBe(false);
    expect(input.isDown('left')).toBe(true);
  });

  it('fires justReleased only when the last alias is released', () => {
    const input = createInput<Action>(
      { jump: [], left: ['ArrowLeft', 'KeyA'], right: [] },
      [provider],
    );

    provider.emit({ code: 'ArrowLeft', kind: 'down' });
    provider.emit({ code: 'KeyA', kind: 'down' });
    input.clearEdges();

    provider.emit({ code: 'ArrowLeft', kind: 'up' });
    expect(input.justReleased('left')).toBe(false);
    expect(input.isDown('left')).toBe(true);

    provider.emit({ code: 'KeyA', kind: 'up' });
    expect(input.justReleased('left')).toBe(true);
    expect(input.isDown('left')).toBe(false);
  });

  it('dedupes repeated down events for the same code', () => {
    const input = createInput<Action>(
      { jump: ['Space'], left: [], right: [] },
      [provider],
    );

    provider.emit({ code: 'Space', kind: 'down' });
    provider.emit({ code: 'Space', kind: 'down' });
    provider.emit({ code: 'Space', kind: 'down' });
    input.clearEdges();

    provider.emit({ code: 'Space', kind: 'up' });
    expect(input.justReleased('jump')).toBe(true);
    expect(input.isDown('jump')).toBe(false);
  });

  it('ignores codes not present in the map', () => {
    const input = createInput<Action>(
      { jump: ['Space'], left: [], right: [] },
      [provider],
    );

    provider.emit({ code: 'KeyQ', kind: 'down' });
    expect(input.isDown('jump')).toBe(false);
    expect(input.justPressed('jump')).toBe(false);
  });

  it('clearEdges resets pressed and released but not down state', () => {
    const input = createInput<Action>(
      { jump: ['Space'], left: [], right: [] },
      [provider],
    );

    provider.emit({ code: 'Space', kind: 'down' });
    expect(input.justPressed('jump')).toBe(true);
    expect(input.isDown('jump')).toBe(true);

    input.clearEdges();
    expect(input.justPressed('jump')).toBe(false);
    expect(input.isDown('jump')).toBe(true);
  });

  it('persists both pressed and released edges within a single tick window', () => {
    const input = createInput<Action>(
      { jump: ['Space'], left: [], right: [] },
      [provider],
    );

    provider.emit({ code: 'Space', kind: 'down' });
    provider.emit({ code: 'Space', kind: 'up' });

    expect(input.justPressed('jump')).toBe(true);
    expect(input.justReleased('jump')).toBe(true);
    expect(input.isDown('jump')).toBe(false);
  });

  it('dispose unsubscribes and disposes every provider', () => {
    const p2 = new FakeProvider();
    const input = createInput<Action>(
      { jump: ['Space'], left: [], right: [] },
      [provider, p2],
    );

    input.dispose();
    expect(provider.disposed).toBe(true);
    expect(p2.disposed).toBe(true);

    provider.emit({ code: 'Space', kind: 'down' });
    expect(input.isDown('jump')).toBe(false);
  });

  it('unsubscribe detaches handlers without disposing providers', () => {
    const p2 = new FakeProvider();
    const input = createInput<Action>(
      { jump: ['Space'], left: [], right: [] },
      [provider, p2],
    );

    input.unsubscribe();
    expect(provider.disposed).toBe(false);
    expect(p2.disposed).toBe(false);

    provider.emit({ code: 'Space', kind: 'down' });
    expect(input.isDown('jump')).toBe(false);
  });

  it('unsubscribe is idempotent', () => {
    const input = createInput<Action>(
      { jump: ['Space'], left: [], right: [] },
      [provider],
    );

    expect(() => {
      input.unsubscribe();
      input.unsubscribe();
    }).not.toThrow();
    expect(provider.disposed).toBe(false);
  });

  it('merges events from multiple providers', () => {
    const p2 = new FakeProvider();
    const input = createInput<Action>(
      { jump: ['Space'], left: ['ArrowLeft'], right: [] },
      [provider, p2],
    );

    provider.emit({ code: 'Space', kind: 'down' });
    p2.emit({ code: 'ArrowLeft', kind: 'down' });

    expect(input.isDown('jump')).toBe(true);
    expect(input.isDown('left')).toBe(true);
  });
});

describe('keyboardProvider', () => {
  function keyEvent(type: 'keydown' | 'keyup', code: string, repeat = false, key = code): Event {
    const e = new Event(type);
    Object.assign(e, { code, key, repeat });
    return e;
  }

  it('emits down/up from DOM keyboard events', () => {
    const target = new EventTarget();
    const kb = new KeyboardProvider({ preventDefaultCodes: [], target });
    const received: InputRawEvent[] = [];
    kb.subscribe(r => received.push(r));

    target.dispatchEvent(keyEvent('keydown', 'Space'));
    target.dispatchEvent(keyEvent('keyup', 'Space'));

    expect(received).toEqual([
      { code: 'Space', kind: 'down' },
      { code: 'Space', kind: 'up' },
    ]);
  });

  it('filters OS-level key repeat via event.repeat', () => {
    const target = new EventTarget();
    const kb = new KeyboardProvider({ preventDefaultCodes: [], target });
    const received: InputRawEvent[] = [];
    kb.subscribe(r => received.push(r));

    target.dispatchEvent(keyEvent('keydown', 'Space', false));
    target.dispatchEvent(keyEvent('keydown', 'Space', true));
    target.dispatchEvent(keyEvent('keydown', 'Space', true));

    expect(received).toEqual([{ code: 'Space', kind: 'down' }]);
  });

  it('dispose removes DOM listeners', () => {
    const target = new EventTarget();
    const kb = new KeyboardProvider({ preventDefaultCodes: [], target });
    const received: InputRawEvent[] = [];
    kb.subscribe(r => received.push(r));

    kb.dispose();
    target.dispatchEvent(keyEvent('keydown', 'Space'));

    expect(received).toEqual([]);
  });

  it('throws with a helpful message when no target is available', () => {
    const globalRef = globalThis as { window?: unknown };
    const originalWindow = globalRef.window;
    try {
      delete globalRef.window;
      expect(() => new KeyboardProvider()).toThrow(/no target available/);
    }
    finally {
      if (originalWindow !== undefined)
        globalRef.window = originalWindow;
    }
  });

  it('emits KeyboardEvent.key instead of code when emit is key', () => {
    const target = new EventTarget();
    const kb = new KeyboardProvider({ emit: 'key', preventDefaultCodes: [], target });
    const received: InputRawEvent[] = [];
    kb.subscribe(r => received.push(r));

    target.dispatchEvent(keyEvent('keydown', 'Period', false, '>'));
    target.dispatchEvent(keyEvent('keyup', 'Period', false, '>'));
    target.dispatchEvent(keyEvent('keydown', 'ArrowDown', false, 'ArrowDown'));

    expect(received).toEqual([
      { code: '>', kind: 'down' },
      { code: '>', kind: 'up' },
      { code: 'ArrowDown', kind: 'down' },
    ]);
  });

  it('keeps down and up symmetric when the modifier state changes between them', () => {
    const target = new EventTarget();
    const kb = new KeyboardProvider({ emit: 'key', preventDefaultCodes: [], target });
    const received: InputRawEvent[] = [];
    kb.subscribe(r => received.push(r));

    // Shift+Period emits '>' on keydown; releasing Shift first makes the
    // keyup for the same physical key report '.'.
    target.dispatchEvent(keyEvent('keydown', 'Period', false, '>'));
    target.dispatchEvent(keyEvent('keyup', 'Period', false, '.'));

    expect(received).toEqual([
      { code: '>', kind: 'down' },
      { code: '>', kind: 'up' },
    ]);
  });

  it('re-press after a modifier-changed release still reports down', () => {
    const target = new EventTarget();
    const kb = new KeyboardProvider({ emit: 'key', preventDefaultCodes: [], target });
    const received: InputRawEvent[] = [];
    kb.subscribe(r => received.push(r));

    target.dispatchEvent(keyEvent('keydown', 'Period', false, '>'));
    target.dispatchEvent(keyEvent('keyup', 'Period', false, '.'));
    target.dispatchEvent(keyEvent('keydown', 'Period', false, '>'));

    expect(received).toEqual([
      { code: '>', kind: 'down' },
      { code: '>', kind: 'up' },
      { code: '>', kind: 'down' },
    ]);
  });

  it('falls back to the event field for a keyup with no preceding keydown', () => {
    const target = new EventTarget();
    const kb = new KeyboardProvider({ emit: 'key', preventDefaultCodes: [], target });
    const received: InputRawEvent[] = [];
    kb.subscribe(r => received.push(r));

    target.dispatchEvent(keyEvent('keyup', 'Period', false, '>'));

    expect(received).toEqual([{ code: '>', kind: 'up' }]);
  });

  it('matches preventDefaultCodes against the field emit selects', () => {
    function pressWith(options: KeyboardProviderOptions): boolean {
      const target = new EventTarget();
      const provider = new KeyboardProvider({ target, ...options });
      provider.subscribe(() => {});
      const event = new Event('keydown', { cancelable: true });
      Object.assign(event, { code: 'Period', key: '>', repeat: false });
      target.dispatchEvent(event);
      provider.dispose();
      return event.defaultPrevented;
    }

    expect(pressWith({ emit: 'key', preventDefaultCodes: ['>'] })).toBe(true);
    expect(pressWith({ emit: 'key', preventDefaultCodes: ['Period'] })).toBe(false);
    expect(pressWith({ preventDefaultCodes: ['Period'] })).toBe(true);
    expect(pressWith({ preventDefaultCodes: ['>'] })).toBe(false);
  });
});
