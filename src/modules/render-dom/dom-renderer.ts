import type { ComponentStore } from '#component-store';
import type { EntityId } from '#entity-id';
import type { Renderer } from '#renderer';
import type { EcsWorld } from '#world';

import type { DomRenderable } from './dom-renderable';

import { RenderOrderDef } from '../render-canvas2d';
import { PositionDef } from '../transform';
import { DomRenderableDef } from './dom-renderable';

const DEFAULT_TAG = 'div';
const ENTITY_ID_ATTR = 'data-entity-id';

interface DrawEntry {
  node: HTMLElement;
  order: number;
  seq: number;
}

interface NodeRecord {
  attrs: Set<string>;
  dataset: Set<string>;
  node: HTMLElement;
  style: Set<string>;
  tag: string;
}

export interface DomRenderContext {
  root: HTMLElement;
  world: EcsWorld;
}

export interface DomRendererOptions {
  reconcile?: (args: {
    entityId: EntityId;
    node: HTMLElement;
    renderable: DomRenderable;
    world: EcsWorld;
  }) => void;
}

export class DomRenderer implements Renderer<DomRenderContext> {
  private readonly options: DomRendererOptions;
  private readonly tracked = new Map<EntityId, NodeRecord>();

  constructor(options: DomRendererOptions = {}) {
    this.options = options;
  }

  private ensureNode(root: HTMLElement, id: EntityId, tag: string): NodeRecord {
    const current = this.tracked.get(id);
    if (current && current.tag === tag) {
      return current;
    }

    if (current) {
      current.node.remove();
      this.tracked.delete(id);
    }

    const record: NodeRecord = {
      attrs: new Set<string>(),
      dataset: new Set<string>(),
      node: root.ownerDocument.createElement(tag),
      style: new Set<string>(),
      tag,
    };

    this.tracked.set(id, record);
    return record;
  }

  private removeMissingNodes(seen: Set<EntityId>): void {
    for (const id of Array.from(this.tracked.keys())) {
      if (seen.has(id)) {
        continue;
      }
      this.removeNode(id);
    }
  }

  private removeNode(id: EntityId): void {
    const tracked = this.tracked.get(id);
    if (!tracked) {
      return;
    }
    tracked.node.remove();
    this.tracked.delete(id);
  }

  render(ctx: DomRenderContext): void {
    const { root, world } = ctx;
    const domStore = world.getStore(DomRenderableDef);
    const orderStore = tryGetStore<{ value: number }>(world, RenderOrderDef);
    const posStore = world.getStore(PositionDef);

    const seen = new Set<EntityId>();
    const entries: DrawEntry[] = [];
    let seq = 0;

    for (const [id, renderable] of domStore) {
      const pos = posStore.get(id);
      if (!pos) {
        seq++;
        this.removeNode(id);
        continue;
      }

      seen.add(id);
      const tracked = this.ensureNode(root, id, renderable.tag ?? DEFAULT_TAG);
      reconcileNode(tracked, id, renderable, pos.x, pos.y);
      if (this.options.reconcile) {
        try {
          this.options.reconcile({
            entityId: id,
            node: tracked.node,
            renderable,
            world,
          });
        }
        catch (error) {
          this.removeNode(id);
          throw error;
        }
      }

      entries.push({
        node: tracked.node,
        order: orderStore?.get(id)?.value ?? 0,
        seq: seq++,
      });
    }

    this.removeMissingNodes(seen);

    entries.sort((a, b) => (a.order - b.order) || (a.seq - b.seq));
    for (const entry of entries) {
      root.appendChild(entry.node);
    }
  }
}

function reconcileNode(
  tracked: NodeRecord,
  entityId: EntityId,
  renderable: DomRenderable,
  x: number,
  y: number,
): void {
  const node = tracked.node;
  node.className = renderable.className ?? '';
  node.hidden = renderable.hidden ?? false;
  node.setAttribute(ENTITY_ID_ATTR, String(entityId));
  node.textContent = renderable.text ?? '';

  reconcileAttributes(node, tracked, renderable.attributes ?? {});
  reconcileDataset(node, tracked, renderable.dataset ?? {});
  reconcileStyle(node, tracked, renderable.style ?? {}, x, y);
}

function reconcileAttributes(
  node: HTMLElement,
  tracked: NodeRecord,
  attributes: Record<string, string>,
): void {
  for (const key of tracked.attrs) {
    if (Object.hasOwn(attributes, key)) {
      continue;
    }
    node.removeAttribute(key);
  }
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, value);
  }
  tracked.attrs = new Set(Object.keys(attributes));
}

function reconcileDataset(
  node: HTMLElement,
  tracked: NodeRecord,
  dataset: Record<string, string>,
): void {
  for (const key of tracked.dataset) {
    if (Object.hasOwn(dataset, key)) {
      continue;
    }
    node.removeAttribute(`data-${key}`);
  }
  for (const [key, value] of Object.entries(dataset)) {
    node.setAttribute(`data-${key}`, value);
  }
  tracked.dataset = new Set(Object.keys(dataset));
}

function reconcileStyle(
  node: HTMLElement,
  tracked: NodeRecord,
  style: Record<string, string>,
  x: number,
  y: number,
): void {
  node.style.left = `${x}px`;
  node.style.position = 'absolute';
  node.style.top = `${y}px`;

  for (const key of tracked.style) {
    if (Object.hasOwn(style, key)) {
      continue;
    }
    node.style.removeProperty(key);
  }
  for (const [key, value] of Object.entries(style)) {
    node.style.setProperty(key, value);
  }
  tracked.style = new Set(Object.keys(style));
}

function tryGetStore<T>(
  world: EcsWorld,
  def: { name: string },
): ComponentStore<T> | null {
  return (world.getStoreByName(def.name) as ComponentStore<T> | undefined) ?? null;
}
