import { afterEach, describe, expect, it, vi } from 'vitest';

import { EcsWorld } from '#world';

import { RenderOrderDef } from '../render-canvas2d';
import { PositionDef } from '../transform';
import { DomRenderableDef } from './dom-renderable';
import { DomRenderer } from './dom-renderer';
import { entityAtPoint } from './entity-at-point';

// jsdom has no layout, so it does not implement `elementFromPoint`; each test
// decides what the "browser" reports at the point.
function hitReturns(el: Element | null): void {
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: vi.fn(() => el),
  });
}

function entityNode(id: string): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('data-entity-id', id);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
  Reflect.deleteProperty(document, 'elementFromPoint');
});

describe('entityAtPoint', () => {
  it('resolves the entity whose node is hit', () => {
    const card = entityNode('7');
    document.body.append(card);
    hitReturns(card);
    expect(entityAtPoint(10, 20)).toBe(7);
    expect(document.elementFromPoint).toHaveBeenCalledWith(10, 20);
  });

  it('walks up from a descendant to the nearest entity node', () => {
    const card = entityNode('3');
    const title = document.createElement('span');
    card.append(title);
    document.body.append(card);
    hitReturns(title);
    expect(entityAtPoint(0, 0)).toBe(3);
  });

  it('returns null for a miss or a non-entity element', () => {
    hitReturns(null);
    expect(entityAtPoint(0, 0)).toBeNull();

    const plain = document.createElement('div');
    document.body.append(plain);
    hitReturns(plain);
    expect(entityAtPoint(0, 0)).toBeNull();
  });

  it('ignores an entity node outside root', () => {
    const root = document.createElement('div');
    const outside = entityNode('5');
    document.body.append(root, outside);
    hitReturns(outside);
    expect(entityAtPoint(0, 0, root)).toBeNull();

    const inside = entityNode('6');
    root.append(inside);
    hitReturns(inside);
    expect(entityAtPoint(0, 0, root)).toBe(6);
  });

  it('rejects a malformed id', () => {
    const bad = entityNode('card-1');
    document.body.append(bad);
    hitReturns(bad);
    expect(entityAtPoint(0, 0)).toBeNull();
  });

  it('reads the attribute DomRenderer writes', () => {
    const world = new EcsWorld();
    world.registerComponent(PositionDef);
    world.registerComponent(RenderOrderDef);
    world.registerComponent(DomRenderableDef);
    world.createEntity();
    const id = world.createEntity();
    world.getStore(PositionDef).set(id, { x: 0, y: 0 });
    world.getStore(DomRenderableDef).set(id, { className: 'card' });

    const root = document.createElement('div');
    document.body.append(root);
    new DomRenderer().render({ root, world });

    hitReturns(root.querySelector('.card'));
    expect(entityAtPoint(0, 0, root)).toBe(id);
  });
});
