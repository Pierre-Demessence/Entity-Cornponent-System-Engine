import type { EventContext } from './event-bus';

import { describe, expect, it, vi } from 'vitest';

import { EventBus } from './event-bus';

interface PingEvent { type: 'Ping'; value: number }
interface PongEvent { type: 'Pong'; value: string }
type TestEvent = PingEvent | PongEvent;

function createBus() {
  return new EventBus<TestEvent>();
}

describe('eventBus', () => {
  describe('basic emit/flush', () => {
    it('delivers events to registered handlers', () => {
      const bus = createBus();
      const received: number[] = [];
      bus.on('Ping', (e, _ctx) => received.push(e.value));

      bus.emit({ type: 'Ping', value: 42 });
      bus.flush();

      expect(received).toEqual([42]);
    });

    it('does not deliver events after off()', () => {
      const bus = createBus();
      const received: number[] = [];
      const handler = (e: PingEvent, _ctx: EventContext) => received.push(e.value);
      bus.on('Ping', handler);
      bus.off('Ping', handler);

      bus.emit({ type: 'Ping', value: 1 });
      bus.flush();

      expect(received).toEqual([]);
    });

    it('unsubscribe function from on() removes handler', () => {
      const bus = createBus();
      const received: number[] = [];
      const unsub = bus.on('Ping', (e, _ctx) => received.push(e.value));
      unsub();

      bus.emit({ type: 'Ping', value: 1 });
      bus.flush();

      expect(received).toEqual([]);
    });

    it('does not cross-deliver between event types', () => {
      const bus = createBus();
      const pings: number[] = [];
      const pongs: string[] = [];
      bus.on('Ping', (e, _ctx) => pings.push(e.value));
      bus.on('Pong', (e, _ctx) => pongs.push(e.value));

      bus.emit({ type: 'Ping', value: 1 });
      bus.flush();

      expect(pings).toEqual([1]);
      expect(pongs).toEqual([]);
    });
  });

  describe('priorities', () => {
    it('fires higher-priority handlers first', () => {
      const bus = createBus();
      const order: string[] = [];
      bus.on('Ping', (_e, _ctx) => order.push('low'), 0);
      bus.on('Ping', (_e, _ctx) => order.push('high'), 10);
      bus.on('Ping', (_e, _ctx) => order.push('mid'), 5);

      bus.emit({ type: 'Ping', value: 1 });
      bus.flush();

      expect(order).toEqual(['high', 'mid', 'low']);
    });

    it('preserves registration order for equal priorities', () => {
      const bus = createBus();
      const order: string[] = [];
      bus.on('Ping', (_e, _ctx) => order.push('first'), 0);
      bus.on('Ping', (_e, _ctx) => order.push('second'), 0);
      bus.on('Ping', (_e, _ctx) => order.push('third'), 0);

      bus.emit({ type: 'Ping', value: 1 });
      bus.flush();

      expect(order).toEqual(['first', 'second', 'third']);
    });

    it('default priority is 0', () => {
      const bus = createBus();
      const order: string[] = [];
      bus.on('Ping', (_e, _ctx) => order.push('default'));
      bus.on('Ping', (_e, _ctx) => order.push('priority-1'), 1);

      bus.emit({ type: 'Ping', value: 1 });
      bus.flush();

      expect(order).toEqual(['priority-1', 'default']);
    });
  });

  describe('stopPropagation', () => {
    it('prevents subsequent handlers from running', () => {
      const bus = createBus();
      const order: string[] = [];
      bus.on('Ping', (_e, ctx) => {
        order.push('first');
        ctx.stopPropagation();
      }, 10);
      bus.on('Ping', (_e, _ctx) => order.push('second'), 0);

      bus.emit({ type: 'Ping', value: 1 });
      bus.flush();

      expect(order).toEqual(['first']);
    });

    it('ctx.consumed reflects propagation state', () => {
      const bus = createBus();
      let consumedBefore = false;
      let consumedAfter = false;
      bus.on('Ping', (_e, ctx) => {
        consumedBefore = ctx.consumed;
        ctx.stopPropagation();
        consumedAfter = ctx.consumed;
      });

      bus.emit({ type: 'Ping', value: 1 });
      bus.flush();

      expect(consumedBefore).toBe(false);
      expect(consumedAfter).toBe(true);
    });

    it('does not affect other events in the same flush', () => {
      const bus = createBus();
      const values: number[] = [];
      bus.on('Ping', (e, ctx) => {
        values.push(e.value);
        ctx.stopPropagation();
      });

      bus.emit({ type: 'Ping', value: 1 });
      bus.emit({ type: 'Ping', value: 2 });
      bus.flush();

      expect(values).toEqual([1, 2]);
    });
  });

  describe('nested flush', () => {
    it('processes events emitted by handlers within the same flush', () => {
      const bus = createBus();
      const values: number[] = [];
      bus.on('Ping', (e, _ctx) => {
        values.push(e.value);
        if (e.value === 1) {
          bus.emit({ type: 'Ping', value: 2 });
        }
      });

      bus.emit({ type: 'Ping', value: 1 });
      bus.flush();

      expect(values).toEqual([1, 2]);
    });

    it('supports chain reactions across event types', () => {
      const bus = createBus();
      const log: string[] = [];
      bus.on('Ping', (e, _ctx) => {
        log.push(`ping:${e.value}`);
        bus.emit({ type: 'Pong', value: `from-${e.value}` });
      });
      bus.on('Pong', (e, _ctx) => {
        log.push(`pong:${e.value}`);
      });

      bus.emit({ type: 'Ping', value: 1 });
      bus.flush();

      expect(log).toEqual(['ping:1', 'pong:from-1']);
    });

    it('respects max depth and defers remaining events', () => {
      const bus = createBus();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const values: number[] = [];

      bus.on('Ping', (e, _ctx) => {
        values.push(e.value);
        if (e.value < 10) {
          bus.emit({ type: 'Ping', value: e.value + 1 });
        }
      });

      bus.emit({ type: 'Ping', value: 0 });
      // maxDepth=2: batch 0 processes Ping(0) → emits Ping(1)
      // batch 1 processes Ping(1) → emits Ping(2), then depth limit hit
      bus.flush(2);

      expect(values).toEqual([0, 1]);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('max flush depth'),
      );
      warn.mockRestore();
    });

    it('uses default max depth of 3', () => {
      const bus = createBus();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const values: number[] = [];

      bus.on('Ping', (e, _ctx) => {
        values.push(e.value);
        bus.emit({ type: 'Ping', value: e.value + 1 });
      });

      bus.emit({ type: 'Ping', value: 0 });
      bus.flush();

      // Default depth 3: batches 0, 1, 2 → processes values 0, 1, 2
      expect(values).toEqual([0, 1, 2]);
      expect(warn).toHaveBeenCalled();
      vi.restoreAllMocks();
    });
  });

  describe('edge cases', () => {
    it('flush with empty queue is a no-op', () => {
      const bus = createBus();
      expect(() => bus.flush()).not.toThrow();
    });

    it('handler added during flush does not run for current event', () => {
      const bus = createBus();
      const late: number[] = [];
      bus.on('Ping', (_e, _ctx) => {
        bus.on('Ping', (e2, _ctx2) => late.push(e2.value));
      });

      bus.emit({ type: 'Ping', value: 1 });
      bus.flush();

      // The dynamically-added handler should not fire for the current batch
      // (because we spread [...entries] before iterating)
      expect(late).toEqual([]);
    });

    it('off() on non-existent type does not throw', () => {
      const bus = createBus();
      const handler = (_e: PingEvent, _ctx: EventContext) => {};
      expect(() => bus.off('Ping', handler)).not.toThrow();
    });

    it('flush() called from handler is a no-op (re-entrant safe)', () => {
      const bus = createBus();
      const order: number[] = [];
      bus.on('Ping', (e, _ctx) => {
        order.push(e.value);
        if (e.value === 1) {
          bus.emit({ type: 'Ping', value: 2 });
          bus.flush(); // should be no-op since already flushing
        }
      });

      bus.emit({ type: 'Ping', value: 1 });
      bus.flush();

      // Ping(2) still gets processed by the outer flush loop
      expect(order).toEqual([1, 2]);
    });
  });
});
