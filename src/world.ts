import type { ColumnStoreOptions } from '#column-store';
import type { AnyComponentDef, ComponentDef, ComponentStoreLike, ComponentValues, TagDef } from '#component-store';
import type { EntityId } from '#entity-id';
import type { LifecycleEvent } from '#lifecycle';
import type { Plugin } from '#plugin';
import type { SpatialStructure } from '#spatial-structure';
import type { EntityTemplate } from '#template';

import { ArchetypeIndex } from '#archetype-index';
import { ChangeClock } from '#change-clock';
import { ColumnStore } from '#column-store';
import { ComponentStore, TagStore } from '#component-store';
import { EntityAllocator } from '#entity-allocator';
import { formatEntityId } from '#entity-id';
import { EventBus } from '#event-bus';
import { Query } from '#query';
import { asObject } from '#validation';

interface ComponentEntry { def: ComponentDef<unknown>; store: ComponentStoreLike<unknown> }
interface TagEntry { def: TagDef; store: TagStore }
interface SpatialBinding { structure: SpatialStructure<unknown>; tag: TagStore | undefined }

/** Options for {@link EcsWorld.enableSpatial}. */
export interface SpatialOptions {
  /**
   * Index only entities that also hold this tag. The index follows the tag
   * being added and removed as well as the component, in either order.
   * Omitted: every entity holding the component is indexed.
   */
  readonly withTag?: TagDef;
}

/**
 * A deferred structural change recorded by `queue*` and applied, in insertion
 * order, at the next `flushCommands()`. For `queueAdd`, `queueRemove`,
 * `queueAddTag`, and `queueRemoveTag`, the component/tag store is resolved at
 * enqueue time (unregistered def throws immediately). For `queueSpawn`, template
 * component names are resolved at flush time inside `_populateEntity`.
 */
type StructuralCommand
  = | { id: EntityId; kind: 'add'; store: ComponentStoreLike<unknown>; value: unknown }
    | { id: EntityId; kind: 'addTag'; store: TagStore }
    | { id: EntityId; kind: 'destroy' }
    | { id: EntityId; kind: 'remove'; store: ComponentStoreLike<unknown> }
    | { id: EntityId; kind: 'removeTag'; store: TagStore }
    | { id: EntityId; kind: 'spawn'; overrides: Record<string, unknown> | undefined; template: EntityTemplate | undefined };

/**
 * Generic, project-agnostic ECS registry: entity id allocation, component/tag
 * stores, queries, template spawn, serialization, and opt-in spatial indexing.
 * No imports from game-specific code.
 */
export class EcsWorld {
  private readonly archetypes = new ArchetypeIndex();
  /**
   * Change-detection clock shared by every registered store. Stores stamp
   * added / changed ticks from it; queries with `added` / `changed` filters
   * advance it. See {@link Query.changed}.
   */
  readonly clock = new ChangeClock();
  private commandQueue: StructuralCommand[] = [];
  private componentRegistry: ComponentEntry[] = [];
  private entities = new EntityAllocator();
  private readonly installedPlugins = new Set<string>();
  /**
   * Engine-internal lifecycle bus. Emits `EntityCreated`, `EntityDestroyed`,
   * `ComponentAdded`, `ComponentRemoved`, `TagAdded`, `TagRemoved`. Queue-based
   * like any `EventBus` — call `lifecycle.flush()` (typically once per tick) to
   * dispatch. Subscribers are not preserved across world swaps.
   *
   * An event is only built and queued while its type has a subscriber, so an
   * unobserved world pays nothing per mutation. A handler therefore sees only
   * the changes made after it subscribed.
   */
  readonly lifecycle = new EventBus<LifecycleEvent>();
  private readonly spatialBindings = new Map<string, SpatialBinding[]>();
  private spawning = false;
  private storeByName = new Map<string, ComponentStoreLike<unknown>>();
  private tagByName = new Map<string, TagStore>();
  private tagRegistry: TagEntry[] = [];

  /** Apply a template's components and tags to an already-allocated entity id. */
  private _populateEntity(id: EntityId, template: EntityTemplate, overrides?: Record<string, unknown>): void {
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
  }

  private _spawnCore(template: EntityTemplate, overrides?: Record<string, unknown>): EntityId {
    const id = this.createEntity();
    this._populateEntity(id, template, overrides);
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

  private assertLoadedAlive(id: EntityId, storeName: string): void {
    if (!this.entities.isAlive(id))
      throw new Error(`EcsWorld.${storeName}: row for entity ${formatEntityId(id)}, which is not live in EcsWorld.entities`);
  }

  /**
   * Reset the world to an empty state — clears every registered component
   * store, tag store, the command queue, and the spatial index (if enabled),
   * then resets id allocation so the next entity is index 0, generation 0.
   * Component and tag *registrations* are preserved; only their contents are
   * wiped. Ids held from before the reset may match entities created after it.
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
    // Clear the archetype index first, then wipe stores — mirrors `loadJSON`,
    // so the rule is uniform: reset the index up front, never rely on the
    // per-row delete events that `store.clear()` emits to unwind it.
    this.archetypes.clear();
    for (const { store } of this.componentRegistry) store.clear();
    for (const { store } of this.tagRegistry) store.clear();
    this.commandQueue = [];
    for (const bindings of this.spatialBindings.values()) {
      for (const { structure } of bindings) structure.clear();
    }
    this.lifecycle.clear();
    this.entities.clear();
  }

  /**
   * Create an empty live entity. Its id may reuse a destroyed entity's index,
   * with a newer generation, so ids held for destroyed entities stay dead.
   */
  createEntity(): EntityId {
    const id = this.entities.allocate();
    this.entities.activate(id);
    if (this.lifecycle.hasListeners('EntityCreated'))
      this.lifecycle.emit({ id, type: 'EntityCreated' });
    return id;
  }

  /**
   * Remove every component and tag from `id` and mark it dead, freeing its
   * index for reuse. A no-op unless `id` is alive, so destroying twice, or
   * through a stale id whose index was reused, never touches another entity.
   */
  destroyEntity(id: EntityId): void {
    if (!this.entities.isAlive(id))
      return;
    this.archetypes.forEachStoreOf(id, store => (store as ComponentStoreLike<unknown> | TagStore).delete(id));
    this.archetypes.removeEntity(id);
    this.entities.release(id);
    if (this.lifecycle.hasListeners('EntityDestroyed'))
      this.lifecycle.emit({ id, type: 'EntityDestroyed' });
  }

  /**
   * Index a component's values in `structure` (e.g. `HashGrid2D` or `HashGrid3D`
   * from `@pierre/ecs/modules/spatial`), keeping it in sync with the component's
   * store — and, with `options.withTag`, restricted to entities holding that
   * tag. Entities that already qualify are indexed immediately.
   *
   * May be called any number of times: several components, or several indexes
   * over one component split by tag. Each call needs its own `structure`.
   * Returns `structure` with its own type, so backend-specific extras (a grid's
   * `getAt`, say) stay typed on the returned handle — keep it to query the index.
   *
   * Once a component is indexed, change its values through {@link move} so the
   * indexes see the old and new position.
   */
  enableSpatial<T, S extends SpatialStructure<T>>(def: ComponentDef<T>, structure: S, options: SpatialOptions = {}): S {
    const store = this.storeByName.get(def.name) as ComponentStoreLike<T> | undefined;
    if (!store)
      throw new Error(`Component "${def.name}" must be registered before enabling spatial.`);
    for (const bindings of this.spatialBindings.values()) {
      if (bindings.some(b => b.structure === structure))
        throw new Error(`enableSpatial("${def.name}"): this structure already backs an index; pass a new structure.`);
    }
    const tag = options.withTag ? this.getTag(options.withTag) : undefined;
    let bindings = this.spatialBindings.get(def.name);
    if (!bindings) {
      bindings = [];
      this.spatialBindings.set(def.name, bindings);
    }
    bindings.push({ structure: structure as SpatialStructure<unknown>, tag });

    store.subscribe('set', (id, pos) => {
      if (!tag || tag.has(id))
        structure.add(id, pos);
    });
    store.subscribe('delete', (id, pos) => {
      if (!tag || tag.has(id))
        structure.remove(id, pos);
    });
    if (tag) {
      tag.subscribe('add', (id) => {
        const pos = store.get(id);
        if (pos !== undefined)
          structure.add(id, pos);
      });
      tag.subscribe('delete', (id) => {
        const pos = store.get(id);
        if (pos !== undefined)
          structure.remove(id, pos);
      });
    }
    for (const [id, pos] of store.entries()) {
      if (!tag || tag.has(id))
        structure.add(id, pos);
    }
    return structure;
  }

  /**
   * End-of-tick convenience: `flushCommands()` then `lifecycle.flush()`.
   *
   * Ordering invariant: structural commands (destroys included) apply first so
   * lifecycle subscribers see the final entity set — any `EntityDestroyed` /
   * `ComponentRemoved` / `ComponentAdded` events they emit are dispatched in the
   * same flush pass.
   *
   * Prefer this over calling both manually in game loops that do not use
   * {@link tick-runner!TickRunner} (which already sequences these internally).
   */
  endOfTick(): void {
    this.flushCommands();
    this.lifecycle.flush();
  }

  /** Number of live entities (created and not yet destroyed). */
  entityCount(): number {
    return this.entities.size;
  }

  /**
   * Apply every queued structural change (`queueSpawn` / `queueDestroy` /
   * `queueAdd` / `queueRemove` / `queueAddTag` / `queueRemoveTag`) in insertion
   * order. Safe to call after a system iteration loop — the loop enqueues, this
   * applies once, so stores are never mutated mid-iteration. A repeated destroy
   * of the same id within one flush collapses to a single destruction.
   */
  flushCommands(): void {
    if (this.commandQueue.length === 0)
      return;
    const commands = this.commandQueue;
    this.commandQueue = [];
    const destroyed = new Set<EntityId>();
    const touched = new Set<EntityId>();
    // Suppress per-set requires-validation for the whole batch — a queued add
    // may legitimately precede the component it depends on — then validate the
    // surviving touched entities once, after the batch is applied.
    const wasSpawning = this.spawning;
    this.spawning = true;
    try {
      for (const cmd of commands) {
        switch (cmd.kind) {
          case 'add':
            // Skip a mutation targeting an id already destroyed this batch (or
            // otherwise dead): it must not resurrect the entity's archetype bits.
            if (this.entities.isAlive(cmd.id)) {
              cmd.store.set(cmd.id, cmd.value);
              touched.add(cmd.id);
            }
            break;
          case 'addTag':
            if (this.entities.isAlive(cmd.id))
              cmd.store.add(cmd.id);
            break;
          case 'destroy':
            if (!destroyed.has(cmd.id)) {
              destroyed.add(cmd.id);
              this.destroyEntity(cmd.id);
            }
            break;
          case 'remove':
            if (this.entities.isAlive(cmd.id))
              cmd.store.delete(cmd.id);
            break;
          case 'removeTag':
            if (this.entities.isAlive(cmd.id))
              cmd.store.delete(cmd.id);
            break;
          case 'spawn':
            this.entities.activate(cmd.id);
            if (this.lifecycle.hasListeners('EntityCreated'))
              this.lifecycle.emit({ id: cmd.id, type: 'EntityCreated' });
            if (cmd.template)
              this._populateEntity(cmd.id, cmd.template, cmd.overrides);
            touched.add(cmd.id);
            break;
        }
      }
    }
    finally {
      this.spawning = wasSpawning;
    }
    if (import.meta.env.DEV) {
      for (const id of touched) {
        if (this.entities.isAlive(id))
          this._validateEntity(id);
      }
    }
  }

  /**
   * Fast-path accessor for a columnar (all-numeric) component's
   * Structure-of-Arrays store, exposing `column()` / `slotOf()` for
   * zero-allocation hot loops. Throws if the component uses object storage.
   */
  getColumnStore<T>(def: ComponentDef<T>): ColumnStore<T> {
    const store = this.getStore(def);
    if (!(store instanceof ColumnStore))
      throw new Error(`Component "${def.name}" is not columnar (uses object storage).`);
    return store as ColumnStore<T>;
  }

  getStore<T>(def: ComponentDef<T>): ComponentStoreLike<T> {
    const store = this.storeByName.get(def.name);
    if (!store)
      throw new Error(`Component "${def.name}" not registered`);
    return store as ComponentStoreLike<T>;
  }

  getStoreByName(name: string): ComponentStoreLike<unknown> | undefined {
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

  /** Whether a plugin with the given name has been installed via {@link use}. */
  hasPlugin(name: string): boolean {
    return this.installedPlugins.has(name);
  }

  /** Whether `id` refers to a live entity — created and not yet destroyed. */
  isAlive(id: EntityId): boolean {
    return this.entities.isAlive(id);
  }

  /** Iterate the live entity ids. Order is unspecified. */
  liveEntities(): IterableIterator<EntityId> {
    return this.entities.live();
  }

  /**
   * In-place load — clears existing stores and repopulates from the serialized
   * payload, restoring id allocation so saved ids, live or stale, keep their
   * meaning. Throws when a component or tag row names an entity that is not
   * live in the saved allocation.
   */
  loadJSON(data: unknown): void {
    const source = asObject(data, 'EcsWorld save payload');
    if (source.entities === undefined && 'nextId' in source)
      throw new Error('EcsWorld save payload: has `nextId` but no `entities` — saves from before id recycling cannot be loaded.');
    this.entities = EntityAllocator.fromSerialized(source.entities, 'EcsWorld.entities');

    // Reset the archetype index up front: `store.clear()` below emits `delete`
    // while the row still exists (has() is true), so its bit would otherwise
    // survive as a phantom. The `store.set` calls that follow rebuild it.
    this.archetypes.clear();
    this.commandQueue = [];

    for (const { def, store } of this.componentRegistry) {
      store.clear();
      const raw = source[def.name];
      if (raw == null)
        continue;
      const loaded = ComponentStore.fromSerialized(raw, `EcsWorld.${def.name}`, def);
      for (const [id, value] of loaded) {
        this.assertLoadedAlive(id, def.name);
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
        this.assertLoadedAlive(id, def.name);
        store.add(id);
      }
    }
  }

  /**
   * Move an entity's indexed component to `to`: every index {@link enableSpatial}
   * bound to `def` that holds the entity moves it from the current value, then
   * `to`'s fields are written into the stored value and the change is stamped.
   * A no-op when the entity lacks the component. Throws when `def` has no index.
   */
  move<T extends object>(def: ComponentDef<T>, id: EntityId, to: T): void {
    const bindings = this.spatialBindings.get(def.name);
    if (!bindings)
      throw new Error(`move() requires enableSpatial() for component "${def.name}".`);
    const store = this.storeByName.get(def.name) as ComponentStoreLike<T>;
    const current = store.get(id);
    if (current === undefined)
      return;
    for (const { structure, tag } of bindings) {
      if (!tag || tag.has(id))
        structure.move(id, current, to);
    }
    Object.assign(current, to);
    store.markChanged(id);
  }

  /**
   * Build a {@link Query} yielding `[id, ...values]` for every entity holding all
   * of `defs`. Build it once and iterate it every tick: the query caches its
   * archetype resolution across passes. `world.query()` with no defs is the
   * entry point for tag-only or filter-only queries.
   */
  query<D extends AnyComponentDef[]>(...defs: D): Query<ComponentValues<D>> {
    const stores = defs.map((def) => {
      const store = this.storeByName.get(def.name);
      if (!store)
        throw new Error(`Component "${def.name}" not registered`);
      return store;
    });
    return new Query<ComponentValues<D>>(stores, this.archetypes);
  }

  /**
   * Enqueue a component add on the next `flushCommands()` call. Safe during
   * system iteration — the store is not mutated until the queue is drained.
   * Throws now if `def` is not registered.
   */
  queueAdd<T>(def: ComponentDef<T>, id: EntityId, value: T): void {
    this.commandQueue.push({ id, kind: 'add', store: this.getStore(def) as ComponentStoreLike<unknown>, value });
  }

  /** Enqueue a tag add on the next `flushCommands()` call. Throws now if `def` is not registered. */
  queueAddTag(def: TagDef, id: EntityId): void {
    this.commandQueue.push({ id, kind: 'addTag', store: this.getTag(def) });
  }

  /**
   * Enqueue an entity for destruction on the next `flushCommands()` call.
   * Safe to call during system iteration — `destroyEntity` is not invoked
   * until the queue is drained, so in-flight queries aren't mutated. Repeated
   * enqueues of the same id collapse to a single destruction per flush.
   */
  queueDestroy(id: EntityId): void {
    this.commandQueue.push({ id, kind: 'destroy' });
  }

  /**
   * Enqueue a component remove on the next `flushCommands()` call. Safe during
   * system iteration. Throws now if `def` is not registered.
   */
  queueRemove<T>(def: ComponentDef<T>, id: EntityId): void {
    this.commandQueue.push({ id, kind: 'remove', store: this.getStore(def) as ComponentStoreLike<unknown> });
  }

  /** Enqueue a tag remove on the next `flushCommands()` call. Throws now if `def` is not registered. */
  queueRemoveTag(def: TagDef, id: EntityId): void {
    this.commandQueue.push({ id, kind: 'removeTag', store: this.getTag(def) });
  }

  /**
   * Reserve an entity id now and enqueue its creation (and optional template
   * population) for the next `flushCommands()` call. The id is returned
   * immediately so a caller can `queueAdd(def, id, …)` against it inside the
   * same loop; the entity becomes alive and emits `EntityCreated` at flush.
   *
   * If `template` references a component name that has not been registered,
   * the error is thrown at flush time (inside `_populateEntity`), not here.
   * An error mid-flush aborts the remaining commands in that flush batch.
   */
  queueSpawn(template?: EntityTemplate, overrides?: Record<string, unknown>): EntityId {
    const id = this.entities.allocate();
    this.commandQueue.push({ id, kind: 'spawn', overrides, template });
    return id;
  }

  registerComponent<T>(def: ComponentDef<T>, options: ColumnStoreOptions = {}): ComponentStoreLike<T> {
    if (this.storeByName.has(def.name))
      throw new Error(`Component "${def.name}" already registered`);
    if (options.shared && !def.columns)
      throw new Error(`Component "${def.name}" cannot use shared storage — it is not columnar (has a non-numeric field).`);
    // Storage is inferred from the schema: all-numeric components (def.columns
    // set by simpleComponent) get columnar Structure-of-Arrays storage; the
    // rest keep the object-backed Map store. Callers never choose.
    const store: ComponentStoreLike<T> = def.columns
      ? new ColumnStore<T>(def.columns, { clock: this.clock, shared: options.shared })
      : new ComponentStore<T>(this.clock);
    this.componentRegistry.push({ def: def as ComponentDef<unknown>, store: store as ComponentStoreLike<unknown> });
    this.storeByName.set(def.name, store as ComponentStoreLike<unknown>);

    const bit = this.archetypes.registerStore(store);
    store.subscribe('set', (id, value) => {
      this.archetypes.addBit(id, bit);
      if (this.lifecycle.hasListeners('ComponentAdded'))
        this.lifecycle.emit({ id, component: def.name, type: 'ComponentAdded', value });
    });
    store.subscribe('delete', (id) => {
      // A value replace also fires 'delete', but the row still exists then
      // (has() is true); only a real removal clears the archetype bit.
      if (!store.has(id))
        this.archetypes.removeBit(id, bit);
      if (this.lifecycle.hasListeners('ComponentRemoved'))
        this.lifecycle.emit({ id, component: def.name, type: 'ComponentRemoved' });
    });

    if (import.meta.env.DEV && def.requires?.length) {
      store.subscribe('validate', (id) => {
        if (this.spawning)
          return;
        for (const reqName of def.requires!) {
          const reqStore = this.storeByName.get(reqName);
          if (reqStore && !reqStore.has(id)) {
            console.warn(`[ECS] Setting "${def.name}" on entity ${formatEntityId(id)}, but required component "${reqName}" is missing.`);
          }
        }
      });
    }

    return store;
  }

  registerTag(def: TagDef): TagStore {
    if (this.tagByName.has(def.name))
      throw new Error(`Tag "${def.name}" already registered`);
    const store = new TagStore(this.clock);
    this.tagRegistry.push({ def, store });
    this.tagByName.set(def.name, store);

    const bit = this.archetypes.registerStore(store);
    store.subscribe('add', (id) => {
      this.archetypes.addBit(id, bit);
      if (this.lifecycle.hasListeners('TagAdded'))
        this.lifecycle.emit({ id, tag: def.name, type: 'TagAdded' });
    });
    store.subscribe('delete', (id) => {
      this.archetypes.removeBit(id, bit);
      if (this.lifecycle.hasListeners('TagRemoved'))
        this.lifecycle.emit({ id, tag: def.name, type: 'TagRemoved' });
    });

    return store;
  }

  /** Create an entity from a template, merging per-component overrides (shallow merge per component). */
  spawn(template: EntityTemplate, overrides?: Record<string, unknown>): EntityId {
    const wasSpawning = this.spawning;
    this.spawning = true;
    let id: EntityId;
    try {
      id = this._spawnCore(template, overrides);
    }
    finally {
      this.spawning = wasSpawning;
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
    const wasSpawning = this.spawning;
    this.spawning = true;
    try {
      for (const { overrides, template } of entries) {
        ids.push(this._spawnCore(template, overrides));
      }
    }
    finally {
      this.spawning = wasSpawning;
    }
    for (const id of ids) this._validateEntity(id);
    return ids;
  }

  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = { entities: this.entities.toSerialized() };
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
   * - `id` becomes live here with the same index and generation. Throws when
   *   this world's entity at that index is a different one, when the index is
   *   retired, or when it is free at a newer generation than `id`'s.
   * - If `componentNames` is given, only those components are transferred.
   *   Names must be registered on this world; unknown names throw.
   * - Values already present on this world for `id` are overwritten.
   */
  transferEntity(
    id: EntityId,
    from: EcsWorld,
    componentNames?: readonly string[],
  ): void {
    const toCopy = componentNames
      ? componentNames.map((name) => {
          const store = this.storeByName.get(name);
          if (!store)
            throw new Error(`Component "${name}" not registered on target world`);
          return { name, store };
        })
      : this.componentRegistry.map(({ def, store }) => ({ name: def.name, store }));
    this.entities.claim(id);

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

  /**
   * Install one or more {@link plugin!Plugin}s, calling each plugin's `build`
   * with this world exactly once. A plugin's `name` must be unique per world —
   * re-installing the same name throws. Installed names survive `clearAll`
   * (the registrations a plugin's `build` created do too), so a plugin cannot
   * be re-`use`d after a reset. Returns `this` for chaining.
   */
  use(...plugins: Plugin[]): this {
    for (const plugin of plugins) {
      if (this.installedPlugins.has(plugin.name))
        throw new Error(`Plugin "${plugin.name}" already installed`);
      // Reserve the name before build so a re-entrant use() of the same plugin
      // throws instead of recursing; roll back if build fails so it can retry.
      this.installedPlugins.add(plugin.name);
      try {
        plugin.build(this);
      }
      catch (error) {
        this.installedPlugins.delete(plugin.name);
        throw error;
      }
    }
    return this;
  }
}
