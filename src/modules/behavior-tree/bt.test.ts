import type { BtNode, BtStatus } from './bt';

import { describe, expect, it } from 'vitest';

import { action, condition, inverter, selector, sequence } from './bt';

interface Ctx {
  log: string[];
}

/** A leaf that records it ran and returns a fixed status. */
function leaf(name: string, status: BtStatus): BtNode<Ctx> {
  return action<Ctx>((ctx) => {
    ctx.log.push(name);
    return status;
  });
}

describe('sequence', () => {
  it('returns success only when every child succeeds', () => {
    const ctx: Ctx = { log: [] };
    expect(sequence(leaf('a', 'success'), leaf('b', 'success'))(ctx)).toBe('success');
    expect(ctx.log).toEqual(['a', 'b']);
  });

  it('fails fast and does not run later children', () => {
    const ctx: Ctx = { log: [] };
    expect(sequence(leaf('a', 'failure'), leaf('b', 'success'))(ctx)).toBe('failure');
    expect(ctx.log).toEqual(['a']);
  });

  it('short-circuits on running', () => {
    const ctx: Ctx = { log: [] };
    expect(sequence(leaf('a', 'running'), leaf('b', 'success'))(ctx)).toBe('running');
    expect(ctx.log).toEqual(['a']);
  });

  it('an empty sequence succeeds', () => {
    expect(sequence<Ctx>()({ log: [] })).toBe('success');
  });
});

describe('selector', () => {
  it('returns success on the first succeeding child', () => {
    const ctx: Ctx = { log: [] };
    expect(selector(leaf('a', 'failure'), leaf('b', 'success'), leaf('c', 'success'))(ctx)).toBe('success');
    expect(ctx.log).toEqual(['a', 'b']); // c not reached
  });

  it('fails only when every child fails', () => {
    const ctx: Ctx = { log: [] };
    expect(selector(leaf('a', 'failure'), leaf('b', 'failure'))(ctx)).toBe('failure');
    expect(ctx.log).toEqual(['a', 'b']);
  });

  it('short-circuits on running', () => {
    const ctx: Ctx = { log: [] };
    expect(selector(leaf('a', 'failure'), leaf('b', 'running'), leaf('c', 'success'))(ctx)).toBe('running');
    expect(ctx.log).toEqual(['a', 'b']);
  });

  it('an empty selector fails', () => {
    expect(selector<Ctx>()({ log: [] })).toBe('failure');
  });
});

describe('inverter', () => {
  it('swaps success and failure', () => {
    const ctx: Ctx = { log: [] };
    expect(inverter(leaf('a', 'success'))(ctx)).toBe('failure');
    expect(inverter(leaf('b', 'failure'))(ctx)).toBe('success');
  });

  it('passes running through', () => {
    expect(inverter(leaf('a', 'running'))({ log: [] })).toBe('running');
  });
});

describe('condition', () => {
  it('is success when the predicate is true, failure otherwise', () => {
    expect(condition<Ctx>(() => true)({ log: [] })).toBe('success');
    expect(condition<Ctx>(() => false)({ log: [] })).toBe('failure');
  });
});

describe('action', () => {
  it('returns the function status', () => {
    expect(action<Ctx>(() => 'running')({ log: [] })).toBe('running');
  });
});

describe('nested composition', () => {
  it('composites nest and evaluate depth-first', () => {
    const ctx: Ctx = { log: [] };
    const tree = selector(
      sequence(
        leaf('a', 'success'),
        selector(leaf('b', 'failure'), leaf('c', 'success')),
      ),
      leaf('d', 'success'),
    );
    // a succeeds → inner selector: b fails, c succeeds → inner sequence succeeds
    // → outer selector succeeds, d never reached.
    expect(tree(ctx)).toBe('success');
    expect(ctx.log).toEqual(['a', 'b', 'c']);
  });

  it('a running leaf deep in a nested tree short-circuits to the root', () => {
    const ctx: Ctx = { log: [] };
    const tree = sequence(
      leaf('a', 'success'),
      selector(leaf('b', 'failure'), leaf('c', 'running'), leaf('d', 'success')),
      leaf('e', 'success'),
    );
    expect(tree(ctx)).toBe('running');
    expect(ctx.log).toEqual(['a', 'b', 'c']); // d and e not reached
  });
});

describe('reactive priority (integration)', () => {
  it('a higher-priority branch preempts a lower one the moment its condition flips', () => {
    // selector[ sequence[threatened? -> flee], wander ]
    const state = { ran: '', threatened: false };
    const tree = selector<typeof state>(
      sequence(
        condition(ctx => ctx.threatened),
        action((ctx) => {
          ctx.ran = 'flee';
          return 'running';
        }),
      ),
      action((ctx) => {
        ctx.ran = 'wander';
        return 'running';
      }),
    );

    tree(state);
    expect(state.ran).toBe('wander');

    state.threatened = true;
    tree(state); // re-tick from root — flee now preempts wander
    expect(state.ran).toBe('flee');
  });
});
