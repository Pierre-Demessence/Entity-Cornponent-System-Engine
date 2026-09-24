import type { InputProvider, InputRawEvent } from '#input-source';
import type { InputEvent } from './event-input';

import { beforeEach, describe, expect, it } from 'vitest';

import { createEventInput } from './event-input';

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
type AliasedAction = 'left' | 'altLeft';

describe('createEventInput', () => {
  let provider: FakeProvider;

  beforeEach(() => {
    provider = new FakeProvider();
  });

  it('dispatches a down edge and an up edge for a mapped code', () => {
    const input = createEventInput<Action>(
      { jump: ['Space'], left: [], right: [] },
      [provider],
    );
    const received: InputEvent<Action>[] = [];
    input.subscribe(e => received.push(e));

    provider.emit({ code: 'Space', kind: 'down' });
    provider.emit({ code: 'Space', kind: 'up' });

    expect(received).toEqual([
      { action: 'jump', kind: 'down' },
      { action: 'jump', kind: 'up' },
    ]);
  });

  it('does not re-fire down when a second alias is pressed while the first is held', () => {
    const input = createEventInput<Action>(
      { jump: [], left: ['ArrowLeft', 'KeyA'], right: [] },
      [provider],
    );
    const received: InputEvent<Action>[] = [];
    input.subscribe(e => received.push(e));

    provider.emit({ code: 'ArrowLeft', kind: 'down' });
    provider.emit({ code: 'KeyA', kind: 'down' });

    expect(received).toEqual([{ action: 'left', kind: 'down' }]);
  });

  it('dedupes repeated down events for the same code', () => {
    const input = createEventInput<Action>(
      { jump: ['Space'], left: [], right: [] },
      [provider],
    );
    const received: InputEvent<Action>[] = [];
    input.subscribe(e => received.push(e));

    provider.emit({ code: 'Space', kind: 'down' });
    provider.emit({ code: 'Space', kind: 'down' });
    provider.emit({ code: 'Space', kind: 'down' });

    expect(received).toEqual([{ action: 'jump', kind: 'down' }]);
  });

  it('ignores codes that are not in the map', () => {
    const input = createEventInput<Action>(
      { jump: ['Space'], left: [], right: [] },
      [provider],
    );
    const received: InputEvent<Action>[] = [];
    input.subscribe(e => received.push(e));

    provider.emit({ code: 'KeyQ', kind: 'down' });

    expect(received).toEqual([]);
  });

  it('ignores an up event with no preceding down', () => {
    const input = createEventInput<Action>(
      { jump: ['Space'], left: [], right: [] },
      [provider],
    );
    const received: InputEvent<Action>[] = [];
    input.subscribe(e => received.push(e));

    provider.emit({ code: 'Space', kind: 'up' });

    expect(received).toEqual([]);
  });

  it('dispatches to every action a code is aliased to', () => {
    const input = createEventInput<AliasedAction>(
      { altLeft: ['ArrowLeft'], left: ['ArrowLeft'] },
      [provider],
    );
    const received: InputEvent<AliasedAction>[] = [];
    input.subscribe(e => received.push(e));

    provider.emit({ code: 'ArrowLeft', kind: 'down' });

    expect(received).toHaveLength(2);
    expect(received).toEqual(expect.arrayContaining([
      { action: 'left', kind: 'down' },
      { action: 'altLeft', kind: 'down' },
    ]));
  });

  it('dispatches synchronously during the provider emit', () => {
    const input = createEventInput<Action>(
      { jump: ['Space'], left: [], right: [] },
      [provider],
    );
    let calledDuringEmit = false;
    input.subscribe(() => {
      calledDuringEmit = true;
    });

    provider.emit({ code: 'Space', kind: 'down' });

    expect(calledDuringEmit).toBe(true);
  });

  it('delivers to every subscriber', () => {
    const input = createEventInput<Action>(
      { jump: ['Space'], left: [], right: [] },
      [provider],
    );
    const first: InputEvent<Action>[] = [];
    const second: InputEvent<Action>[] = [];
    input.subscribe(e => first.push(e));
    input.subscribe(e => second.push(e));

    provider.emit({ code: 'Space', kind: 'down' });

    expect(first).toEqual([{ action: 'jump', kind: 'down' }]);
    expect(second).toEqual([{ action: 'jump', kind: 'down' }]);
  });

  it('subscribe returns a function that removes that handler only', () => {
    const input = createEventInput<Action>(
      { jump: ['Space'], left: [], right: [] },
      [provider],
    );
    const kept: InputEvent<Action>[] = [];
    const removed: InputEvent<Action>[] = [];
    input.subscribe(e => kept.push(e));
    const off = input.subscribe(e => removed.push(e));

    off();
    provider.emit({ code: 'Space', kind: 'down' });

    expect(kept).toEqual([{ action: 'jump', kind: 'down' }]);
    expect(removed).toEqual([]);
  });

  it('late subscribers receive only subsequent events', () => {
    const input = createEventInput<Action>(
      { jump: ['Space'], left: [], right: [] },
      [provider],
    );
    const early: InputEvent<Action>[] = [];
    input.subscribe(e => early.push(e));
    provider.emit({ code: 'Space', kind: 'down' });

    const late: InputEvent<Action>[] = [];
    input.subscribe(e => late.push(e));
    provider.emit({ code: 'Space', kind: 'up' });

    expect(early).toEqual([
      { action: 'jump', kind: 'down' },
      { action: 'jump', kind: 'up' },
    ]);
    expect(late).toEqual([{ action: 'jump', kind: 'up' }]);
  });

  it('unsubscribe detaches from providers without disposing them', () => {
    const input = createEventInput<Action>(
      { jump: ['Space'], left: [], right: [] },
      [provider],
    );
    const received: InputEvent<Action>[] = [];
    input.subscribe(e => received.push(e));

    input.unsubscribe();
    provider.emit({ code: 'Space', kind: 'down' });

    expect(provider.disposed).toBe(false);
    expect(received).toEqual([]);
  });

  it('unsubscribe is idempotent', () => {
    const input = createEventInput<Action>(
      { jump: ['Space'], left: [], right: [] },
      [provider],
    );

    expect(() => {
      input.unsubscribe();
      input.unsubscribe();
    }).not.toThrow();
    expect(provider.disposed).toBe(false);
  });

  it('dispose unsubscribes and disposes every provider', () => {
    const p2 = new FakeProvider();
    const input = createEventInput<Action>(
      { jump: ['Space'], left: [], right: [] },
      [provider, p2],
    );

    input.dispose();

    expect(provider.disposed).toBe(true);
    expect(p2.disposed).toBe(true);
  });

  it('re-press after a clean up dispatches down again', () => {
    const input = createEventInput<Action>(
      { jump: ['Space'], left: [], right: [] },
      [provider],
    );
    const received: InputEvent<Action>[] = [];
    input.subscribe(e => received.push(e));

    provider.emit({ code: 'Space', kind: 'down' });
    provider.emit({ code: 'Space', kind: 'up' });
    provider.emit({ code: 'Space', kind: 'down' });

    expect(received).toEqual([
      { action: 'jump', kind: 'down' },
      { action: 'jump', kind: 'up' },
      { action: 'jump', kind: 'down' },
    ]);
  });

  it('registers a given handler function once', () => {
    const input = createEventInput<Action>(
      { jump: ['Space'], left: [], right: [] },
      [provider],
    );
    const received: InputEvent<Action>[] = [];
    const handler = (event: InputEvent<Action>): void => {
      received.push(event);
    };
    const off = input.subscribe(handler);
    input.subscribe(handler);

    provider.emit({ code: 'Space', kind: 'down' });
    off();
    provider.emit({ code: 'Space', kind: 'up' });

    expect(received).toEqual([{ action: 'jump', kind: 'down' }]);
  });

  it('a handler subscribed during a dispatch does not receive the in-flight edge', () => {
    const input = createEventInput<Action>(
      { jump: ['Space'], left: ['Enter'], right: [] },
      [provider],
    );
    const late: InputEvent<Action>[] = [];
    input.subscribe(() => {
      input.subscribe(e => late.push(e));
    });

    provider.emit({ code: 'Space', kind: 'down' });
    provider.emit({ code: 'Enter', kind: 'down' });

    expect(late).toEqual([{ action: 'left', kind: 'down' }]);
  });

  it('dispose from inside a handler still delivers the in-flight edge to the rest', () => {
    const input = createEventInput<Action>(
      { jump: ['Space'], left: [], right: [] },
      [provider],
    );
    const received: InputEvent<Action>[] = [];
    input.subscribe(() => {
      input.dispose();
    });
    input.subscribe(e => received.push(e));

    provider.emit({ code: 'Space', kind: 'down' });

    expect(received).toEqual([{ action: 'jump', kind: 'down' }]);
  });

  it('merges events from multiple providers', () => {
    const p2 = new FakeProvider();
    const input = createEventInput<Action>(
      { jump: ['Space'], left: ['ArrowLeft'], right: [] },
      [provider, p2],
    );
    const received: InputEvent<Action>[] = [];
    input.subscribe(e => received.push(e));

    provider.emit({ code: 'Space', kind: 'down' });
    p2.emit({ code: 'ArrowLeft', kind: 'down' });

    expect(received).toEqual([
      { action: 'jump', kind: 'down' },
      { action: 'left', kind: 'down' },
    ]);
  });
});
