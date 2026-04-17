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
});
