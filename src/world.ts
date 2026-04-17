import type { ComponentDef, TagDef } from './component-store';
import type { EntityId } from './entity-id';
import type { LifecycleEvent } from './lifecycle';
import type { EntityTemplate } from './template';

import { ComponentStore, TagStore } from './component-store';
import { EventBus } from './event-bus';
import { QueryBuilder } from './query';
import { SpatialIndex } from './spatial';
import { asNumber, asObject } from './validation';

interface ComponentEntry { def: ComponentDef<unknown>; store: ComponentStore<unknown> }
interface TagEntry { def: TagDef; store: TagStore }

/**
 * Generic, project-agnostic ECS registry: entity id allocation, component/tag
 * stores, queries, template spawn, serialization, and opt-in spatial indexing.
 * No imports from game-specific code.
 */
export class EcsWorld {
  private _spatial = new SpatialIndex();

  private componentRegistry: ComponentEntry[] = [];
  private destroyQueue = new Set<EntityId>();
  /**
   * Engine-internal lifecycle bus. Emits `EntityCreated`, `EntityDestroyed`,
   * `ComponentAdded`, `ComponentRemoved`. Queue-based like any `EventBus` —
   * call `lifecycle.flush()` (typically once per tick) to dispatch. Subscribers
   * are not preserved across world swaps.
   */
  readonly lifecycle = new EventBus<LifecycleEvent>();
  private nextId = 0;
  private spatialDef: ComponentDef<unknown> | undefined;
  private spawning = false;
  private storeByName = new Map<string, ComponentStore<unknown>>();
  private tagByName = new Map<string, TagStore>();
  private tagRegistry: TagEntry[] = [];

  /** Expose `nextId` for subclasses that need to copy it across world instances. */
  protected get _nextId(): number { return this.nextId; }

  protected set _nextId(value: number) { this.nextId = value; }

  clearAllDirty(): void {
    for (const { store } of this.componentRegistry) store.clearDirty();
    for (const { store } of this.tagRegistry) store.clearDirty();
  }

  createEntity(): EntityId {
    const id = this.nextId++;
    this.lifecycle.emit({ id, type: 'EntityCreated' });
    return id;
  }

  destroyEntity(id: EntityId): void {
    for (const { store } of this.componentRegistry) store.delete(id);
    for (const { store } of this.tagRegistry) store.delete(id);
    this.lifecycle.emit({ id, type: 'EntityDestroyed' });
  }

  /**
   * Opt in to spatial indexing for a component that carries `{x, y}`. May only
   * be called once per world — installs `set`/`delete` subscribers on the store.
   */
  enableSpatial<T extends { x: number; y: number }>(def: ComponentDef<T>): void {
    if (this.spatialDef) {
      throw new Error(`Spatial already enabled for "${this.spatialDef.name}"; cannot re-enable for "${def.name}".`);
    }
    const store = this.storeByName.get(def.name);
    if (!store)
      throw new Error(`Component "${def.name}" must be registered before enabling spatial.`);
    this.spatialDef = def as ComponentDef<unknown>;
    const typedStore = store as ComponentStore<T>;
    typedStore.subscribe('set', (id, pos) => {
      this._spatial.add(id, pos.x, pos.y);
    });
    typedStore.subscribe('delete', (id, pos) => {
      this._spatial.remove(id, pos.x, pos.y);
    });
  }

  /**
   * Destroy all entities enqueued via `queueDestroy`. Safe to call after a
   * system iteration loop — removes entities in one batch without mutating
   * stores during iteration.
   */
  flushDestroys(): void {
    if (this.destroyQueue.size === 0)
      return;
    const ids = [...this.destroyQueue];
    this.destroyQueue.clear();
    for (const id of ids) this.destroyEntity(id);
  }

  getStore<T>(def: ComponentDef<T>): ComponentStore<T> {
    const store = this.storeByName.get(def.name);
    if (!store)
      throw new Error(`Component "${def.name}" not registered`);
    return store as ComponentStore<T>;
  }

  getStoreByName(name: string): ComponentStore<unknown> | undefined {
    return this.storeByName.get(name);
  }

  getTag(def: TagDef): TagStore {
    const store = this.tagByName.get(def.name);
    if (!store)
      throw new Error(`Tag "${def.name}" not registered`);
    return store;
  }

  getTagByName(name: string): TagStore | undefined {
    return this.tagByName.get(name);
  }

  /** In-place load — clears existing stores and repopulates from the serialized payload. */
  loadJSON(data: unknown): void {
    const source = asObject(data, 'EcsWorld save payload');
    this.nextId = asNumber(source.nextId, 'EcsWorld.nextId');

    for (const { def, store } of this.componentRegistry) {
      store.clear();
      const raw = source[def.name];
      if (raw == null)
        continue;
      const loaded = ComponentStore.fromSerialized(raw, `EcsWorld.${def.name}`, def);
      for (const [id, value] of loaded) {
        store.set(id, value);
      }
    }
    for (const { def, store } of this.tagRegistry) {
      store.clear();
      const raw = source[def.name];
      if (raw == null)
        continue;
      const loaded = TagStore.fromSerialized(raw, `EcsWorld.${def.name}`);
      for (const id of loaded) {
        store.add(id);
      }
    }
  }

  /** Move an entity — updates the spatial index. Requires `enableSpatial` to have been called. */
  move(id: EntityId, x: number, y: number): void {
    if (!this.spatialDef)
      throw new Error('move() requires enableSpatial() to have been called.');
    const store = this.storeByName.get(this.spatialDef.name) as ComponentStore<{ x: number; y: number }>;
    const pos = store.get(id);
    if (!pos)
      return;
    this._spatial.move(id, pos.x, pos.y, x, y);
    pos.x = x;
    pos.y = y;
    store.markDirty(id);
  }

  query<A>(d1: ComponentDef<A>): QueryBuilder<[A]>;
  query<A, B>(d1: ComponentDef<A>, d2: ComponentDef<B>): QueryBuilder<[A, B]>;
  query<A, B, C>(d1: ComponentDef<A>, d2: ComponentDef<B>, d3: ComponentDef<C>): QueryBuilder<[A, B, C]>;
  query<A, B, C, D>(d1: ComponentDef<A>, d2: ComponentDef<B>, d3: ComponentDef<C>, d4: ComponentDef<D>): QueryBuilder<[A, B, C, D]>;
  query(...defs: ComponentDef<unknown>[]): QueryBuilder<unknown[]> {
    const stores = defs.map((def) => {
      const store = this.storeByName.get(def.name);
      if (!store)
        throw new Error(`Component "${def.name}" not registered`);
      return store;
    });
    return new QueryBuilder(stores);
  }

  /**
   * Enqueue an entity for destruction on the next `flushDestroys()` call.
   * Safe to call during system iteration — `destroyEntity` is not invoked
   * until the queue is drained, so in-flight queries aren't mutated.
   */
  queueDestroy(id: EntityId): void {
    this.destroyQueue.add(id);
  }

  registerComponent<T>(def: ComponentDef<T>): ComponentStore<T> {
    if (this.storeByName.has(def.name))
      throw new Error(`Component "${def.name}" already registered`);
    const store = new ComponentStore<T>();
    this.componentRegistry.push({ def: def as ComponentDef<unknown>, store: store as ComponentStore<unknown> });
    this.storeByName.set(def.name, store as ComponentStore<unknown>);

    store.subscribe('set', (id, value) => {
      this.lifecycle.emit({ id, component: def.name, type: 'ComponentAdded', value });
    });
    store.subscribe('delete', (id) => {
      this.lifecycle.emit({ id, component: def.name, type: 'ComponentRemoved' });
    });

    if (import.meta.env.DEV && def.requires?.length) {
      store.subscribe('validate', (id) => {
        if (this.spawning)
          return;
        for (const reqName of def.requires!) {
          const reqStore = this.storeByName.get(reqName);
          if (reqStore && !reqStore.has(id)) {
            console.warn(`[ECS] Setting "${def.name}" on entity ${id}, but required component "${reqName}" is missing.`);
          }
        }
      });
    }

    return store;
  }

  registerTag(def: TagDef): TagStore {
    if (this.tagByName.has(def.name))
      throw new Error(`Tag "${def.name}" already registered`);
    const store = new TagStore();
    this.tagRegistry.push({ def, store });
    this.tagByName.set(def.name, store);
    return store;
  }

  get spatial(): SpatialIndex { return this._spatial; }

  /** Create an entity from a template, merging per-component overrides (shallow merge per component). */
  spawn(template: EntityTemplate, overrides?: Record<string, unknown>): EntityId {
    const id = this.createEntity();

    const allComponentNames = new Set<string>();
    if (template.components) {
      for (const name of Object.keys(template.components)) allComponentNames.add(name);
    }
    if (overrides) {
      for (const name of Object.keys(overrides)) allComponentNames.add(name);
    }

    this.spawning = true;
    for (const name of allComponentNames) {
      const templateData = template.components?.[name];
      const overrideData = overrides?.[name];
      const merged = templateData && overrideData
        ? { ...(templateData as object), ...(overrideData as object) }
        : structuredClone(overrideData ?? templateData);
      const store = this.storeByName.get(name);
      if (!store)
        throw new Error(`Component "${name}" not registered`);
      store.set(id, merged);
    }
    this.spawning = false;

    if (import.meta.env.DEV) {
      for (const { def, store } of this.componentRegistry) {
        if (def.requires?.length && store.has(id)) {
          store.validate(id);
        }
      }
    }

    if (template.tags) {
      for (const tagName of template.tags) {
        const store = this.tagByName.get(tagName);
        if (!store)
          throw new Error(`Tag "${tagName}" not registered`);
        store.add(id);
      }
    }
    return id;
  }

  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = { nextId: this.nextId };
    for (const { def, store } of this.componentRegistry) {
      result[def.name] = store.toSerialized(def);
    }
    for (const { def, store } of this.tagRegistry) {
      result[def.name] = store.toSerialized();
    }
    return result;
  }
}
