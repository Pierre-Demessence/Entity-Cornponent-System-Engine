import type { SchedulableSystem } from './scheduler';

import { describe, expect, it, vi } from 'vitest';

import { Scheduler } from './scheduler';

function sys(name: string, opts?: { runAfter?: string[]; runBefore?: string[] }): SchedulableSystem<void> {
  return { name, run: vi.fn(), ...opts };
}

describe('scheduler', () => {
  it('runs systems in insertion order when no deps', () => {
    const s = new Scheduler<void>();
    const log: string[] = [];
    s.add({ name: 'a', run: () => log.push('a') });
    s.add({ name: 'b', run: () => log.push('b') });
    s.add({ name: 'c', run: () => log.push('c') });
    s.run();
    expect(log).toEqual(['a', 'b', 'c']);
  });

  it('respects runAfter dependencies', () => {
    const s = new Scheduler<void>();
    const log: string[] = [];
    s.add({ name: 'b', runAfter: ['a'], run: () => log.push('b') });
    s.add({ name: 'a', run: () => log.push('a') });
    s.run();
    expect(log).toEqual(['a', 'b']);
  });

  it('respects runBefore dependencies', () => {
    const s = new Scheduler<void>();
    const log: string[] = [];
    s.add({ name: 'a', runBefore: ['b'], run: () => log.push('a') });
    s.add({ name: 'b', run: () => log.push('b') });
    s.run();
    expect(log).toEqual(['a', 'b']);
  });

  it('handles diamond dependency graph', () => {
    const s = new Scheduler<void>();
    const log: string[] = [];
    s.add({ name: 'a', run: () => log.push('a') });
    s.add({ name: 'b', runAfter: ['a'], run: () => log.push('b') });
    s.add({ name: 'c', runAfter: ['a'], run: () => log.push('c') });
    s.add({ name: 'd', runAfter: ['b', 'c'], run: () => log.push('d') });
    s.run();
    expect(log.indexOf('a')).toBeLessThan(log.indexOf('b'));
    expect(log.indexOf('a')).toBeLessThan(log.indexOf('c'));
    expect(log.indexOf('b')).toBeLessThan(log.indexOf('d'));
    expect(log.indexOf('c')).toBeLessThan(log.indexOf('d'));
  });

  it('throws on duplicate system name', () => {
    const s = new Scheduler<void>();
    s.add(sys('dup'));
    s.add(sys('dup'));
    expect(() => s.build()).toThrow('Duplicate system name: "dup"');
  });

  it('throws on circular dependency', () => {
    const s = new Scheduler<void>();
    s.add(sys('a', { runAfter: ['b'] }));
    s.add(sys('b', { runAfter: ['a'] }));
    expect(() => s.build()).toThrow(/Circular dependency/);
  });

  it('throws on unknown runAfter dependency', () => {
    const s = new Scheduler<void>();
    s.add(sys('a', { runAfter: ['ghost'] }));
    expect(() => s.build()).toThrow(/unknown system "ghost"/);
  });

  it('throws on unknown runBefore target', () => {
    const s = new Scheduler<void>();
    s.add(sys('a', { runBefore: ['ghost'] }));
    expect(() => s.build()).toThrow(/unknown system "ghost"/);
  });

  it('reports size correctly', () => {
    const s = new Scheduler<void>();
    expect(s.size).toBe(0);
    s.add(sys('a'));
    s.add(sys('b'));
    expect(s.size).toBe(2);
  });

  it('remove() unregisters a system and invalidates sort', () => {
    const s = new Scheduler<void>();
    s.add(sys('a'));
    s.add(sys('b'));
    s.build();
    s.remove('a');
    expect(s.size).toBe(1);
    expect(s.order).toEqual(['b']);
  });

  it('order getter auto-builds', () => {
    const s = new Scheduler<void>();
    s.add(sys('x'));
    s.add(sys('y'));
    expect(s.order).toEqual(['x', 'y']);
  });

  it('iterator auto-builds and yields systems', () => {
    const s = new Scheduler<void>();
    s.add(sys('a'));
    s.add(sys('b'));
    const names = Array.from(s, sys => sys.name);
    expect(names).toEqual(['a', 'b']);
  });

  describe('lifecycle hooks', () => {
    it('calls init once before first run', () => {
      const s = new Scheduler<{ tick: number }>();
      const init = vi.fn();
      const run = vi.fn();
      s.add({ name: 'a', init, run });

      const ctx = { tick: 1 };
      s.run(ctx);
      s.run(ctx);

      expect(init).toHaveBeenCalledOnce();
      expect(init).toHaveBeenCalledWith(ctx);
      expect(run).toHaveBeenCalledTimes(2);
    });

    it('init fires before run in the same tick', () => {
      const s = new Scheduler<void>();
      const log: string[] = [];
      s.add({
        name: 'a',
        init: () => log.push('init'),
        run: () => log.push('run'),
      });
      s.run(undefined);
      expect(log).toEqual(['init', 'run']);
    });

    it('calls dispose on the next run after remove, with that run\'s ctx', () => {
      const s = new Scheduler<{ tick: number }>();
      const dispose = vi.fn();
      s.add({ name: 'a', dispose, run: () => {} });
      s.run({ tick: 1 });

      s.remove('a');
      const disposeCtx = { tick: 2 };
      s.run(disposeCtx);

      expect(dispose).toHaveBeenCalledOnce();
      expect(dispose).toHaveBeenCalledWith(disposeCtx);
    });

    it('skips dispose for a system removed before it was ever initialized', () => {
      const s = new Scheduler<void>();
      const dispose = vi.fn();
      s.add({ name: 'a', dispose, run: () => {} });
      s.remove('a');
      s.run(undefined);
      expect(dispose).not.toHaveBeenCalled();
    });

    it('disposeAll tears down every initialized system synchronously', () => {
      const s = new Scheduler<void>();
      const disposeA = vi.fn();
      const disposeB = vi.fn();
      s.add({ name: 'a', dispose: disposeA, run: () => {} });
      s.add({ name: 'b', dispose: disposeB, run: () => {} });
      s.run(undefined);

      s.disposeAll(undefined);

      expect(disposeA).toHaveBeenCalledOnce();
      expect(disposeB).toHaveBeenCalledOnce();

      // After disposeAll, re-running should call init again (systems treated as fresh).
      const init = vi.fn();
      s.add({ name: 'c', init, run: () => {} });
      s.run(undefined);
      expect(init).toHaveBeenCalledOnce();
    });
  });

  it('add() invalidates cached sort', () => {
    const s = new Scheduler<void>();
    s.add(sys('a'));
    s.build();
    s.add(sys('b', { runBefore: ['a'] }));
    expect(s.order).toEqual(['b', 'a']);
  });

  it('passes context to system run()', () => {
    const s = new Scheduler<number>();
    const received: number[] = [];
    s.add({ name: 'sys', run: ctx => received.push(ctx) });
    s.run(42);
    expect(received).toEqual([42]);
  });

  describe('phases', () => {
    it('runs phases in declared order regardless of insertion order', () => {
      const s = new Scheduler<void>({ phases: ['input', 'logic', 'render'] });
      const log: string[] = [];
      s.add({ name: 'r', phase: 'render', run: () => log.push('r') });
      s.add({ name: 'l', phase: 'logic', run: () => log.push('l') });
      s.add({ name: 'i', phase: 'input', run: () => log.push('i') });
      s.run();
      expect(log).toEqual(['i', 'l', 'r']);
    });

    it('dAG-sorts within a phase, preserving phase boundaries', () => {
      const s = new Scheduler<void>({ phases: ['a', 'b'] });
      const log: string[] = [];
      s.add({ name: 'b1', phase: 'b', run: () => log.push('b1') });
      s.add({ name: 'a2', phase: 'a', runAfter: ['a1'], run: () => log.push('a2') });
      s.add({ name: 'a1', phase: 'a', run: () => log.push('a1') });
      s.add({ name: 'b2', phase: 'b', runAfter: ['b1'], run: () => log.push('b2') });
      s.run();
      expect(log).toEqual(['a1', 'a2', 'b1', 'b2']);
    });

    it('throws when a system declares phase but scheduler has none', () => {
      const s = new Scheduler<void>();
      expect(() =>
        s.add({ name: 'x', phase: 'logic', run: () => {} }),
      ).toThrow(/without phases/);
    });

    it('throws when a system has no phase but scheduler has phases', () => {
      const s = new Scheduler<void>({ phases: ['input'] });
      expect(() =>
        s.add({ name: 'x', run: () => {} }),
      ).toThrow(/must declare a phase/);
    });

    it('throws on a phase name not in the declared list', () => {
      const s = new Scheduler<void>({ phases: ['input', 'render'] });
      expect(() =>
        s.add({ name: 'x', phase: 'logic', run: () => {} }),
      ).toThrow(/unknown phase "logic"/);
    });

    it('throws on cross-phase runAfter', () => {
      const s = new Scheduler<void>({ phases: ['a', 'b'] });
      s.add({ name: 'ax', phase: 'a', run: () => {} });
      s.add({ name: 'bx', phase: 'b', runAfter: ['ax'], run: () => {} });
      expect(() => s.build()).toThrow(/cross-phase dependencies/);
    });

    it('throws on cross-phase runBefore', () => {
      const s = new Scheduler<void>({ phases: ['a', 'b'] });
      s.add({ name: 'ax', phase: 'a', runBefore: ['bx'], run: () => {} });
      s.add({ name: 'bx', phase: 'b', run: () => {} });
      expect(() => s.build()).toThrow(/cross-phase dependencies/);
    });

    it('rejects duplicate phase names at construction', () => {
      expect(() => new Scheduler<void>({ phases: ['a', 'a'] })).toThrow(/Duplicate phase/);
    });

    it('detects cycles within a phase', () => {
      const s = new Scheduler<void>({ phases: ['logic'] });
      s.add({ name: 'a', phase: 'logic', runAfter: ['b'], run: () => {} });
      s.add({ name: 'b', phase: 'logic', runAfter: ['a'], run: () => {} });
      expect(() => s.build()).toThrow(/Circular dependency/);
    });

    it('exposes the phase-ordered execution order via `order`', () => {
      const s = new Scheduler<void>({ phases: ['first', 'second'] });
      s.add({ name: 's', phase: 'second', run: () => {} });
      s.add({ name: 'f', phase: 'first', run: () => {} });
      expect(s.order).toEqual(['f', 's']);
    });
  });
});
