import type { Plugin } from '#plugin';

import { describe, expect, it } from 'vitest';

import { simpleComponent } from '#component-store';
import { EcsWorld } from '#world';

const PosDef = simpleComponent('pos', { x: 'number', y: 'number' });

describe('plugin', () => {
  it('calls build once with the world and marks it installed', () => {
    const world = new EcsWorld();
    let built: EcsWorld | undefined;
    let calls = 0;
    const plugin: Plugin = {
      name: 'p',
      build(w) {
        built = w;
        calls++;
      },
    };

    const returned = world.use(plugin);

    expect(built).toBe(world);
    expect(calls).toBe(1);
    expect(world.hasPlugin('p')).toBe(true);
    expect(returned).toBe(world);
  });

  it('reports unknown plugins as not installed', () => {
    const world = new EcsWorld();
    expect(world.hasPlugin('nope')).toBe(false);
  });

  it('throws when a plugin name is installed twice', () => {
    const world = new EcsWorld();
    const plugin: Plugin = { name: 'dup', build() {} };
    world.use(plugin);
    expect(() => world.use(plugin)).toThrow('Plugin "dup" already installed');
    expect(() => world.use({ name: 'dup', build() {} })).toThrow('already installed');
  });

  it('installs several plugins in argument order', () => {
    const world = new EcsWorld();
    const order: string[] = [];
    world.use(
      { name: 'a', build() { order.push('a'); } },
      { name: 'b', build() { order.push('b'); } },
      { name: 'c', build() { order.push('c'); } },
    );
    expect(order).toEqual(['a', 'b', 'c']);
    expect(world.hasPlugin('b')).toBe(true);
  });

  it('lets a plugin register components that then work', () => {
    const world = new EcsWorld();
    world.use({
      name: 'positions',
      build(w) {
        w.registerComponent(PosDef);
      },
    });
    const id = world.createEntity();
    world.getStore(PosDef).set(id, { x: 1, y: 2 });
    expect(world.query(PosDef).run()).toEqual([[id, { x: 1, y: 2 }]]);
  });

  it('keeps installed plugins across clearAll (registrations persist)', () => {
    const world = new EcsWorld();
    const plugin: Plugin = {
      name: 'once',
      build(w) {
        w.registerComponent(PosDef);
      },
    };
    world.use(plugin);
    world.clearAll();
    expect(world.hasPlugin('once')).toBe(true);
    expect(() => world.use(plugin)).toThrow('already installed');
  });

  it('rolls back the reservation when build throws, allowing a retry', () => {
    const world = new EcsWorld();
    let attempts = 0;
    const flaky: Plugin = {
      name: 'flaky',
      build() {
        attempts++;
        if (attempts === 1)
          throw new Error('boom');
      },
    };
    expect(() => world.use(flaky)).toThrow('boom');
    expect(world.hasPlugin('flaky')).toBe(false);
    world.use(flaky);
    expect(world.hasPlugin('flaky')).toBe(true);
  });

  it('lets a plugin install another plugin during build', () => {
    const world = new EcsWorld();
    const inner: Plugin = { name: 'inner', build() {} };
    const outer: Plugin = {
      name: 'outer',
      build(w) {
        w.use(inner);
      },
    };
    world.use(outer);
    expect(world.hasPlugin('inner')).toBe(true);
    expect(world.hasPlugin('outer')).toBe(true);
  });

  it('treats use() with no plugins as a no-op', () => {
    const world = new EcsWorld();
    expect(world.use()).toBe(world);
  });
});
