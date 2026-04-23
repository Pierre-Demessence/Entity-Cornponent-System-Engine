import { simpleComponent } from '#component-store';
import { EcsWorld } from '#world';
import { describe, expect, it } from 'vitest';

import { SceneTransitionQueue, transferEntities } from './scene-transition';

const PositionDef = simpleComponent('position', {
  x: 'number',
  y: 'number',
});

const HealthDef = simpleComponent('health', {
  hp: 'number',
});

describe('sceneTransitionQueue', () => {
  it('applies enqueued transitions in FIFO order', () => {
    const queue = new SceneTransitionQueue();
    const calls: number[] = [];

    queue.enqueue(() => calls.push(1));
    queue.enqueue(() => calls.push(2));

    expect(queue.applyNext()).toBe(true);
    expect(queue.applyNext()).toBe(true);
    expect(queue.applyNext()).toBe(false);
    expect(calls).toEqual([1, 2]);
  });

  it('replace() keeps only the latest transition', () => {
    const queue = new SceneTransitionQueue();
    const calls: string[] = [];

    queue.enqueue(() => calls.push('old'));
    queue.replace(() => calls.push('new'));

    expect(queue.size).toBe(1);
    expect(queue.applyNext()).toBe(true);
    expect(calls).toEqual(['new']);
  });

  it('clear() removes all pending transitions', () => {
    const queue = new SceneTransitionQueue();
    queue.enqueue(() => {});
    queue.enqueue(() => {});

    queue.clear();

    expect(queue.hasPending()).toBe(false);
    expect(queue.applyNext()).toBe(false);
  });
});

describe('transferEntities', () => {
  it('copies selected entities between worlds', () => {
    const from = new EcsWorld();
    const fromPos = from.registerComponent(PositionDef);

    const to = new EcsWorld();
    const toPos = to.registerComponent(PositionDef);

    const a = from.createEntity();
    const b = from.createEntity();
    fromPos.set(a, { x: 1, y: 2 });
    fromPos.set(b, { x: 3, y: 4 });

    transferEntities(to, from, [a, b]);

    expect(toPos.get(a)).toEqual({ x: 1, y: 2 });
    expect(toPos.get(b)).toEqual({ x: 3, y: 4 });
  });

  it('respects optional component filter', () => {
    const from = new EcsWorld();
    const fromPos = from.registerComponent(PositionDef);
    const fromHealth = from.registerComponent(HealthDef);

    const to = new EcsWorld();
    const toPos = to.registerComponent(PositionDef);
    const toHealth = to.registerComponent(HealthDef);

    const id = from.createEntity();
    fromPos.set(id, { x: 5, y: 6 });
    fromHealth.set(id, { hp: 10 });

    transferEntities(to, from, [id], ['position']);

    expect(toPos.get(id)).toEqual({ x: 5, y: 6 });
    expect(toHealth.get(id)).toBeUndefined();
  });
});
