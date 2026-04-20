import type { ComponentDef, TagDef } from '#component-store';
import type { EntityId } from '#entity-id';
import type { LifecycleEvent } from '#lifecycle';
import type { SpatialStructure } from '#spatial-structure';
import type { EntityTemplate } from '#template';

import { ComponentStore, TagStore } from '#component-store';
import { EventBus } from '#event-bus';
import { HashGrid2D } from '#modules/spatial/hash-grid-2d';
import { QueryBuilder } from '#query';
import { asNumber, asObject } from '#validation';

interface ComponentEntry { def: ComponentDef<unknown>; store: ComponentStore<unknown> }
interface TagEntry { def: TagDef; store: TagStore }

/**
 * Generic, project-agnostic ECS registry: entity id allocation, component/tag
 * stores, queries, template spawn, serialization, and opt-in spatial indexing.
 * No imports from game-specific code.
 */
export class EcsWorld {
  private _spatial: SpatialStructure<{ x: number; y: number }> | undefined;

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

  private _spawnCore(template: EntityTemplate, overrides?: Record<string, unknown>): EntityId {
    const id = this.createEntity();

    const allComponentNames = new Set<string>();
    if (template.components) {
      for (const name of Object.keys(template.components)) allComponentNames.add(name);
    }
    if (overrides) {
      for (const name of Object.keys(overrides)) allComponentNames.add(name);
    }

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

  private _validateEntity(id: EntityId): void {
    if (!import.meta.env.DEV)
      return;
    for (const { def, store } of this.componentRegistry) {
      if (def.requires?.length && store.has(id)) {
        store.validate(id);
      }
    }
  }

  /**
   * Reset the world to an empty state — clears every registered component
   * store, tag store, the destroy queue, and the spatial index (if enabled),
   * then rewinds `nextId` to 0. Component and tag *registrations* are
   * preserved; only their contents are wiped.
   *
   * Intended for "restart the game" / "respawn" paths in prototypes that
   * tear down and rebuild mid-session. Silent by design — does **not**
   * emit `EntityDestroyed` lifecycle events for the cleared entities, to
   * avoid a reset-time event storm. Callers that need per-entity cleanup
   * observation should destroy entities individually before calling this.
   *
   * Pending lifecycle events are dropped with the queue clear.
   */
  clearAll(): void {
    for (const { store } of this.componentRegistry) store.clear();
    for (const { store } of this.tagRegistry) store.clear();
    this.destroyQueue.clear();
    this._spatial?.clear();
    this.lifecycle.clear();
    this.nextId = 0;
  }

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
   *
   * `structure` defaults to a fresh {@link HashGrid2D}. Pass any other
   * {@link SpatialStructure} to swap in a different backend (QuadTree, etc.).
   */
  enableSpatial<T extends { x: number; y: number }>(
    def: ComponentDef<T>,
    structure: SpatialStructure<{ x: number; y: number }> = new HashGrid2D(),
  ): void {
    if (this.spatialDef) {
      throw new Error(`Spatial already enabled for "${this.spatialDef.name}"; cannot re-enable for "${def.name}".`);
    }
    const store = this.storeByName.get(def.name);
    if (!store)
      throw new Error(`Component "${def.name}" must be registered before enabling spatial.`);
    this.spatialDef = def as ComponentDef<unknown>;
    this._spatial = structure;
    const typedStore = store as ComponentStore<T>;
    typedStore.subscribe('set', (id, pos) => {
      this._spatial!.add(id, pos);
    });
    typedStore.subscribe('delete', (id, pos) => {
      this._spatial!.remove(id, pos);
    });
  }

  /**
   * End-of-tick convenience: `flushDestroys()` then `lifecycle.flush()`.
   *
   * Ordering invariant: destroys run first so lifecycle subscribers see
   * the final entity set — any `EntityDestroyed` / `ComponentRemoved`
   * events emitted by destruction are dispatched in the same flush pass.
   *
   * Prefer this over calling both manually in game loops that do not use
   * {@link TickRunner} (which already sequences these internally).
   */
  endOfTick(): void {
    this.flushDestroys();
    this.lifecycle.flush();
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
    if (!this.spatialDef || !this._spatial)
      throw new Error('move() requires enableSpatial() to have been called.');
    const store = this.storeByName.get(this.spatialDef.name) as ComponentStore<{ x: number; y: number }>;
    const pos = store.get(id);
    if (!pos)
      return;
    this._spatial.move(id, pos, { x, y });
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

  /**
   * The spatial index. Typed as {@link HashGrid2D} (the default backend) so
   * game callers can use grid-specific extras (`getAt`, `findAt`, `getInRect`).
   * If you've passed a non-grid structure to `enableSpatial`, cast or expose
   * it via a subclass getter.
   */
  get spatial(): HashGrid2D {
    if (!this._spatial)
      throw new Error('spatial requires enableSpatial() to have been called.');
    return this._spatial as HashGrid2D;
  }

  /** Create an entity from a template, merging per-component overrides (shallow merge per component). */
  spawn(template: EntityTemplate, overrides?: Record<string, unknown>): EntityId {
    this.spawning = true;
    let id: EntityId;
    try {
      id = this._spawnCore(template, overrides);
    }
    finally {
      this.spawning = false;
    }
    this._validateEntity(id);
    return id;
  }

  /**
   * Spawn many entities at once, suppressing per-entity DEV validation until
   * the whole batch is attached. All entities validate together after all
   * template components have been set, which means cross-entity requirements
   * (if ever introduced) see a consistent world, and validation overhead is
   * paid once instead of per call. Behaviour matches calling `spawn` in a loop
   * apart from the deferred validation.
   */
  spawnBatch(
    entries: readonly { template: EntityTemplate; overrides?: Record<string, unknown> }[],
  ): EntityId[] {
    const ids: EntityId[] = [];
    this.spawning = true;
    try {
      for (const { overrides, template } of entries) {
        ids.push(this._spawnCore(template, overrides));
      }
    }
    finally {
      this.spawning = false;
    }
    for (const id of ids) this._validateEntity(id);
    return ids;
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

  /**
   * Copy an entity's components from another world into this one, preserving
   * its `EntityId`. Used during level transitions and any scenario where an
   * entity must survive a world swap.
   *
   * - Components are iterated in registration order. Each value is
   *   `structuredClone`-d on copy so the two worlds never share references.
   * - **Tags are not transferred** — tags are application-semantic (which
   *   tags follow the entity depends on the game). Callers own tag handling.
   * - `nextId` is bumped to `max(this.nextId, from.nextId, id + 1)` so later
   *   `createEntity()` calls on this world won't collide with the source.
   * - If `componentNames` is given, only those components are transferred.
   *   Names must be registered on this world; unknown names throw.
   * - Values already present on this world for `id` are overwritten.
   */
  transferEntity(
    id: EntityId,
    from: EcsWorld,
    componentNames?: readonly string[],
  ): void {
    this.nextId = Math.max(this.nextId, from.nextId, id + 1);

    const toCopy = componentNames
      ? componentNames.map((name) => {
          const store = this.storeByName.get(name);
          if (!store)
            throw new Error(`Component "${name}" not registered on target world`);
          return { name, store };
        })
      : this.componentRegistry.map(({ def, store }) => ({ name: def.name, store }));

    for (const { name, store } of toCopy) {
      const fromStore = from.storeByName.get(name);
      if (!fromStore)
        continue;
      const value = fromStore.get(id);
      if (value === undefined)
        continue;
      store.set(id, structuredClone(value));
    }
  }
}
