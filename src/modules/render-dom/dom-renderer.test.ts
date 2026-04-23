import type { ComponentStore } from '#component-store';

import type { RenderOrder } from '../render-canvas2d';
import type { DomRenderable } from './dom-renderable';

import { EcsWorld } from '#world';
import { describe, expect, it, vi } from 'vitest';

import { RenderOrderDef } from '../render-canvas2d';
import { PositionDef } from '../transform';
import { DomRenderableDef } from './dom-renderable';
import { DomRenderer } from './dom-renderer';

class FakeStyle {
  left = '';
  position = '';
  private readonly props = new Map<string, string>();
  top = '';

  getPropertyValue(name: string): string {
    return this.props.get(name) ?? '';
  }

  removeProperty(name: string): void {
    this.props.delete(name);
  }

  setProperty(name: string, value: string): void {
    this.props.set(name, value);
  }
}

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  className = '';
  hidden = false;
  readonly ownerDocument: FakeDocument;
  parent: FakeElement | null = null;
  readonly style = new FakeStyle();
  readonly tagName: string;
  textContent: string | null = null;

  constructor(tag: string, ownerDocument: FakeDocument) {
    this.ownerDocument = ownerDocument;
    this.tagName = tag.toUpperCase();
  }

  appendChild(child: FakeElement): FakeElement {
    if (child.parent) {
      const idx = child.parent.children.indexOf(child);
      if (idx >= 0) {
        child.parent.children.splice(idx, 1);
      }
    }
    child.parent = this;
    this.children.push(child);
    return child;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  remove(): void {
    if (!this.parent) {
      return;
    }
    const idx = this.parent.children.indexOf(this);
    if (idx >= 0) {
      this.parent.children.splice(idx, 1);
    }
    this.parent = null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

class FakeDocument {
  createElement(tag: string): FakeElement {
    return new FakeElement(tag, this);
  }
}

interface TestHarness {
  orders: ComponentStore<RenderOrder>;
  positions: ComponentStore<{ x: number; y: number }>;
  renderables: ComponentStore<DomRenderable>;
  root: FakeElement;
  world: EcsWorld;
}

function createHarness(): TestHarness {
  const world = new EcsWorld();
  const positions = world.registerComponent(PositionDef);
  const renderables = world.registerComponent(DomRenderableDef);
  const orders = world.registerComponent(RenderOrderDef);
  const doc = new FakeDocument();
  const root = doc.createElement('div');

  return {
    orders,
    positions,
    renderables,
    root,
    world,
  };
}

function findByEntityId(root: FakeElement, entityId: number): FakeElement | null {
  for (const child of root.children) {
    if (child.getAttribute('data-entity-id') === String(entityId)) {
      return child;
    }
  }
  return null;
}

function testRender(
  renderer: DomRenderer,
  root: FakeElement,
  world: EcsWorld,
): void {
  renderer.render({
    root: root as unknown as HTMLElement,
    world,
  });
}

describe('domRenderer', () => {
  it('creates and updates entity nodes with stable data-entity-id mapping', () => {
    const { positions, renderables, root, world } = createHarness();
    const renderer = new DomRenderer();
    const id = world.createEntity();

    positions.set(id, { x: 12, y: 7 });
    renderables.set(id, {
      className: 'card',
      dataset: { zone: 'hand' },
      style: { 'z-index': '2' },
      text: 'Strike',
    });

    testRender(renderer, root, world);

    const node = findByEntityId(root, id);
    expect(node).not.toBeNull();
    expect(node?.className).toBe('card');
    expect(node?.textContent).toBe('Strike');
    expect(node?.style.left).toBe('12px');
    expect(node?.style.top).toBe('7px');
    expect(node?.getAttribute('data-zone')).toBe('hand');
    expect(node?.style.getPropertyValue('z-index')).toBe('2');

    positions.set(id, { x: 3, y: 4 });
    renderables.set(id, {
      className: 'card-updated',
      text: 'Defend',
    });

    testRender(renderer, root, world);

    expect(node?.className).toBe('card-updated');
    expect(node?.textContent).toBe('Defend');
    expect(node?.style.left).toBe('3px');
    expect(node?.style.top).toBe('4px');
    expect(node?.getAttribute('data-zone')).toBeNull();
    expect(node?.style.getPropertyValue('z-index')).toBe('');

    renderables.delete(id);
    testRender(renderer, root, world);

    expect(findByEntityId(root, id)).toBeNull();
  });

  it('removes stale nodes when required components disappear', () => {
    const { positions, renderables, root, world } = createHarness();
    const renderer = new DomRenderer();
    const id = world.createEntity();

    positions.set(id, { x: 1, y: 2 });
    renderables.set(id, { text: 'node' });
    testRender(renderer, root, world);

    expect(root.children.length).toBe(1);

    positions.delete(id);
    testRender(renderer, root, world);

    expect(root.children.length).toBe(0);
  });

  it('applies the hidden flag from DomRenderable', () => {
    const { positions, renderables, root, world } = createHarness();
    const renderer = new DomRenderer();
    const id = world.createEntity();

    positions.set(id, { x: 0, y: 0 });
    renderables.set(id, { hidden: true, text: 'node' });
    testRender(renderer, root, world);

    const node = findByEntityId(root, id);
    expect(node?.hidden).toBe(true);

    renderables.set(id, { hidden: false, text: 'node' });
    testRender(renderer, root, world);

    expect(node?.hidden).toBe(false);
  });

  it('orders DOM nodes by RenderOrderDef then insertion sequence', () => {
    const { orders, positions, renderables, root, world } = createHarness();
    const renderer = new DomRenderer();

    const back = world.createEntity();
    const front = world.createEntity();

    positions.set(back, { x: 0, y: 0 });
    positions.set(front, { x: 1, y: 1 });
    renderables.set(back, { text: 'back' });
    renderables.set(front, { text: 'front' });
    orders.set(back, { value: 10 });
    orders.set(front, { value: 0 });

    testRender(renderer, root, world);

    const ids = root.children.map(child => Number(child.getAttribute('data-entity-id')));

    expect(ids).toEqual([front, back]);
  });

  it('is idempotent across repeated renders', () => {
    const { positions, renderables, root, world } = createHarness();
    const renderer = new DomRenderer();
    const id = world.createEntity();

    positions.set(id, { x: 2, y: 3 });
    renderables.set(id, { text: 'steady' });

    testRender(renderer, root, world);
    const first = findByEntityId(root, id);

    testRender(renderer, root, world);
    const second = findByEntityId(root, id);

    expect(root.children.length).toBe(1);
    expect(second).toBe(first);
  });

  it('recreates a node if the configured tag changes', () => {
    const { positions, renderables, root, world } = createHarness();
    const renderer = new DomRenderer();
    const id = world.createEntity();

    positions.set(id, { x: 5, y: 5 });
    renderables.set(id, {
      tag: 'div',
      text: 'first',
    });
    testRender(renderer, root, world);

    const first = findByEntityId(root, id);
    expect(first?.tagName).toBe('DIV');

    renderables.set(id, {
      tag: 'span',
      text: 'second',
    });
    testRender(renderer, root, world);

    const second = findByEntityId(root, id);
    expect(second?.tagName).toBe('SPAN');
    expect(second).not.toBe(first);
  });

  it('runs optional per-entity reconcile hooks after base reconciliation', () => {
    const { positions, renderables, root, world } = createHarness();
    const reconcile = vi.fn(({ node }: { node: HTMLElement }) => {
      (node as unknown as FakeElement).setAttribute('data-hook', 'ok');
    });
    const renderer = new DomRenderer({ reconcile });
    const id = world.createEntity();

    positions.set(id, { x: 9, y: 9 });
    renderables.set(id, { text: 'hooked' });
    testRender(renderer, root, world);

    const node = findByEntityId(root, id);
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(node?.getAttribute('data-hook')).toBe('ok');
  });

  it('drops the tracked node if the reconcile hook throws', () => {
    const { positions, renderables, root, world } = createHarness();
    const renderer = new DomRenderer({
      reconcile() {
        throw new Error('boom');
      },
    });
    const id = world.createEntity();

    positions.set(id, { x: 1, y: 1 });
    renderables.set(id, { text: 'x' });

    expect(() => testRender(renderer, root, world)).toThrow('boom');
    expect(findByEntityId(root, id)).toBeNull();
  });
});
