import type { EventBus } from '#event-bus';
import type { TickInfo, TickSource } from '#tick-source';

import { Scheduler } from '#scheduler';
import { createTestWorld } from '#test-utils';
import { describe, expect, it, vi } from 'vitest';

import { TickRunner } from './tick-runner';

/**
 * Minimal in-test tick source so the core runner tests stay independent of
 * any concrete `TickSource` implementation (which lives in modules).
 */
class StubSource implements TickSource {
  private readonly handlers = new Set<(info: TickInfo) => void>();
  private n = 0;

  emit(): void {
    const info: TickInfo = { kind: 'discrete', tickNumber: this.n++ };
    for (const h of this.handlers) h(info);
  }

  start(): void {}

  stop(): void {}

  subscribe(h: (info: TickInfo) => void): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }
}

interface Ctx {
  events: EventBus<{ type: string }>;
  trace: string[];
}

function makeFixture() {
  const source = new StubSource();
  const scheduler = new Scheduler<Ctx>();
  const world = createTestWorld();
  const trace: string[] = [];

  const flushSpy = vi.fn(() => trace.push('events.flush'));
  const lifecycleSpy = vi.spyOn(world.lifecycle, 'flush').mockImplementation(() => {
    trace.push('lifecycle.flush');
  });
  const destroySpy = vi.spyOn(world, 'flushDestroys').mockImplementation(() => {
    trace.push('flushDestroys');
  });
  const clearSpy = vi.spyOn(world, 'clearAllDirty').mockImplementation(() => {
    trace.push('clearAllDirty');
  });

  const events = { flush: flushSpy } as unknown as EventBus<{ type: string }>;

  return { clearSpy, destroySpy, events, flushSpy, lifecycleSpy, scheduler, source, trace, world };
}

describe('tickRunner', () => {
  it('runs the per-tick ceremony in order', () => {
    const f = makeFixture();
    f.scheduler.add({
      name: 'sys',
      run: ctx => ctx.trace.push('system'),
    });

    const runner = new TickRunner<Ctx>({
      scheduler: f.scheduler,
      source: f.source,
      contextFactory: () => ({ events: f.events, trace: f.trace }),
      getEvents: ctx => ctx.events,
      getWorld: () => f.world,
    });
    runner.start();
    f.source.emit();

    expect(f.trace).toEqual(['system', 'events.flush', 'lifecycle.flush', 'flushDestroys', 'clearAllDirty']);
  });

  it('passes the correct info to contextFactory and onTickComplete', () => {
    const f = makeFixture();
    const factory = vi.fn((_info: TickInfo): Ctx => ({ events: f.events, trace: f.trace }));
    const onComplete = vi.fn();

    const runner = new TickRunner<Ctx>({
      contextFactory: factory,
      onTickComplete: onComplete,
      scheduler: f.scheduler,
      source: f.source,
      getEvents: ctx => ctx.events,
      getWorld: () => f.world,
    });
    runner.start();
    f.source.emit();
    f.source.emit();

    expect(factory.mock.calls.map(c => c[0].tickNumber)).toEqual([0, 1]);
    expect(onComplete.mock.calls.map(c => c[1].tickNumber)).toEqual([0, 1]);
  });

  it('flushes even if the scheduler throws', () => {
    const f = makeFixture();
    f.scheduler.add({
      name: 'boom',
      run: () => {
        throw new Error('boom');
      },
    });

    const runner = new TickRunner<Ctx>({
      scheduler: f.scheduler,
      source: f.source,
      contextFactory: () => ({ events: f.events, trace: f.trace }),
      getEvents: ctx => ctx.events,
      getWorld: () => f.world,
    });
    runner.start();
    expect(() => f.source.emit()).toThrow('boom');
    expect(f.trace).toContain('events.flush');
    expect(f.trace).toContain('lifecycle.flush');
    expect(f.trace).toContain('flushDestroys');
    expect(f.trace).toContain('clearAllDirty');
  });

  it('stops receiving ticks after stop()', () => {
    const f = makeFixture();
    const factory = vi.fn((): Ctx => ({ events: f.events, trace: f.trace }));

    const runner = new TickRunner<Ctx>({
      contextFactory: factory,
      scheduler: f.scheduler,
      source: f.source,
      getEvents: ctx => ctx.events,
      getWorld: () => f.world,
    });
    runner.start();
    f.source.emit();
    runner.stop();
    f.source.emit();

    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('fires onBeforeFlush after systems, before flush + cleanup', () => {
    const f = makeFixture();
    f.scheduler.add({
      name: 'sys',
      run: ctx => ctx.trace.push('system'),
    });

    const runner = new TickRunner<Ctx>({
      scheduler: f.scheduler,
      source: f.source,
      contextFactory: () => ({ events: f.events, trace: f.trace }),
      getEvents: ctx => ctx.events,
      getWorld: () => f.world,
      onBeforeFlush: ctx => ctx.trace.push('onBeforeFlush'),
    });
    runner.start();
    f.source.emit();

    expect(f.trace).toEqual([
      'system',
      'onBeforeFlush',
      'events.flush',
      'lifecycle.flush',
      'flushDestroys',
      'clearAllDirty',
    ]);
  });

  it('fires onBeforeFlush even if the scheduler throws', () => {
    const f = makeFixture();
    f.scheduler.add({
      name: 'boom',
      run: () => {
        throw new Error('boom');
      },
    });
    const onBefore = vi.fn();

    const runner = new TickRunner<Ctx>({
      onBeforeFlush: onBefore,
      scheduler: f.scheduler,
      source: f.source,
      contextFactory: () => ({ events: f.events, trace: f.trace }),
      getEvents: ctx => ctx.events,
      getWorld: () => f.world,
    });
    runner.start();
    expect(() => f.source.emit()).toThrow('boom');
    expect(onBefore).toHaveBeenCalledTimes(1);
  });

  it('resolves the world lazily on each tick (supports between-tick world swap)', () => {
    const f = makeFixture();
    const world2 = createTestWorld();
    vi.spyOn(world2.lifecycle, 'flush').mockImplementation(() => f.trace.push('w2.lifecycle'));
    vi.spyOn(world2, 'flushDestroys').mockImplementation(() => f.trace.push('w2.destroys'));
    vi.spyOn(world2, 'clearAllDirty').mockImplementation(() => f.trace.push('w2.clear'));

    let current = f.world;
    const runner = new TickRunner<Ctx>({
      scheduler: f.scheduler,
      source: f.source,
      contextFactory: () => ({ events: f.events, trace: f.trace }),
      getEvents: ctx => ctx.events,
      getWorld: () => current,
    });
    runner.start();
    f.source.emit();
    current = world2;
    f.source.emit();

    expect(f.trace).toContain('lifecycle.flush');
    expect(f.trace).toContain('w2.lifecycle');
    expect(f.trace).toContain('w2.destroys');
    expect(f.trace).toContain('w2.clear');
  });
});
