import type { FsmStates } from './fsm';

import { describe, expect, it } from 'vitest';

import { makeFsm, tickFsm } from './fsm';

type Key = 'a' | 'b' | 'c';

interface Ctx {
  goTo: Key | null;
  log: string[];
}

function makeStates(): FsmStates<Ctx, Key> {
  return {
    a: {
      onEnter: ctx => ctx.log.push('enter:a'),
      onExit: ctx => ctx.log.push('exit:a'),
      update: ctx => ctx.goTo,
    },
    b: {
      onEnter: ctx => ctx.log.push('enter:b'),
      onExit: ctx => ctx.log.push('exit:b'),
      update: ctx => ctx.goTo,
    },
    c: {
      update: ctx => ctx.goTo,
    },
  };
}

describe('makeFsm', () => {
  it('starts in the initial state with zero elapsed', () => {
    const fsm = makeFsm<Key>('a');
    expect(fsm.current).toBe('a');
    expect(fsm.elapsedMs).toBe(0);
  });
});

describe('tickFsm', () => {
  it('accumulates elapsedMs while staying in a state', () => {
    const fsm = makeFsm<Key>('a');
    const ctx: Ctx = { goTo: null, log: [] };
    tickFsm(fsm, makeStates(), ctx, 16);
    tickFsm(fsm, makeStates(), ctx, 16);
    expect(fsm.current).toBe('a');
    expect(fsm.elapsedMs).toBe(32);
  });

  it('does not fire onEnter/onExit while staying (null or same key)', () => {
    const fsm = makeFsm<Key>('a');
    const states = makeStates();
    const ctx: Ctx = { goTo: null, log: [] };
    tickFsm(fsm, states, ctx, 16);
    ctx.goTo = 'a'; // same-key return = stay, no re-enter
    tickFsm(fsm, states, ctx, 16);
    expect(ctx.log).toEqual([]);
    expect(fsm.current).toBe('a');
  });

  it('transitions: runs old onExit → switches → resets elapsed → new onEnter', () => {
    const fsm = makeFsm<Key>('a');
    const states = makeStates();
    const ctx: Ctx = { goTo: null, log: [] };
    tickFsm(fsm, states, ctx, 20); // stay in a, elapsed 20
    ctx.goTo = 'b';
    tickFsm(fsm, states, ctx, 16); // transition a → b
    expect(ctx.log).toEqual(['exit:a', 'enter:b']);
    expect(fsm.current).toBe('b');
    expect(fsm.elapsedMs).toBe(0);
  });

  it('accumulates elapsed for the tick of the transition before resetting', () => {
    // elapsed is added first, then update runs and may transition (reset).
    const fsm = makeFsm<Key>('a');
    const states = makeStates();
    const ctx: Ctx = { goTo: 'b', log: [] };
    tickFsm(fsm, states, ctx, 16);
    expect(fsm.elapsedMs).toBe(0); // reset on transition
    expect(fsm.current).toBe('b');
  });

  it('tolerates states without onEnter/onExit (optional hooks)', () => {
    const fsm = makeFsm<Key>('b');
    const states = makeStates();
    const ctx: Ctx = { goTo: 'c', log: [] };
    tickFsm(fsm, states, ctx, 16); // b → c; c has no onEnter
    expect(ctx.log).toEqual(['exit:b']);
    expect(fsm.current).toBe('c');
    ctx.goTo = null;
    tickFsm(fsm, states, ctx, 16); // stay in c (no hooks)
    expect(fsm.current).toBe('c');
  });

  it('passes self (elapsedMs / current) to update', () => {
    const fsm = makeFsm<Key>('a');
    let seen = -1;
    const states: FsmStates<Ctx, Key> = {
      b: { update: () => null },
      c: { update: () => null },
      a: {
        update: (_ctx, self) => {
          seen = self.elapsedMs;
          return null;
        },
      },
    };
    tickFsm(fsm, states, { goTo: null, log: [] }, 25);
    expect(seen).toBe(25);
  });

  it('resets elapsedMs before the new state onEnter runs', () => {
    const fsm = makeFsm<Key>('a');
    let enterElapsed = -1;
    const states: FsmStates<Ctx, Key> = {
      a: { update: () => 'b' },
      b: { onEnter: (_ctx, self) => { enterElapsed = self.elapsedMs; }, update: () => null },
      c: { update: () => null },
    };
    tickFsm(fsm, states, { goTo: null, log: [] }, 40);
    expect(enterElapsed).toBe(0);
  });
});
