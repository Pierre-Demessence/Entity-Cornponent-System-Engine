import type { EntityId } from './entity-id';

import { asArray, asNumber } from './validation';

/** Schema definition for a component type — handles serialization and optional dependency declarations. */
export interface ComponentDef<T> {
  readonly name: string;
  /** Other component names that must be present on the same entity. */
  readonly requires?: readonly string[];
  deserialize: (raw: unknown, label: string) => T;
  serialize: (value: T) => unknown;
}

/** Schema definition for a boolean tag (presence/absence, no associated data). */
export interface TagDef {
  readonly name: string;
}

/** Handler signatures for `ComponentStore.subscribe`. */
export type StoreSetHandler<T> = (id: EntityId, value: T) => void;
export type StoreDeleteHandler<T> = (id: EntityId, oldValue: T) => void;
export type StoreValidateHandler = (id: EntityId) => void;

/**
 * Map from EntityId to component data, with dirty-tracking and lifecycle hooks.
 *
 * Lifecycle hooks are exposed via `subscribe(event, fn)` and returns an
 * unsubscribe function. Multiple observers are supported: the spatial index,
 * DEV-mode dependency validation, dev inspectors, and plugins can all attach
 * independently without clobbering each other.
 *
 * Emission order within `set()`: `validate` → `delete` (if replacing an
 * existing value) → `set`.
 */
export class ComponentStore<T> implements Iterable<[EntityId, T]> {
  private readonly deleteHandlers: StoreDeleteHandler<T>[] = [];
  private readonly dirty = new Set<EntityId>();
  private readonly map = new Map<EntityId, T>();
  private readonly setHandlers: StoreSetHandler<T>[] = [];
  private readonly validateHandlers: StoreValidateHandler[] = [];

  clear(): void {
    if (this.deleteHandlers.length > 0) {
      for (const [id, value] of this.map) this.emitDelete(id, value);
    }
    this.map.clear();
    this.dirty.clear();
  }

  clearDirty(): void { this.dirty.clear(); }

  delete(id: EntityId): boolean {
    const old = this.map.get(id);
    const deleted = this.map.delete(id);
    if (deleted) {
      this.dirty.add(id);
      if (old !== undefined)
        this.emitDelete(id, old);
    }
    return deleted;
  }

  private emitDelete(id: EntityId, oldValue: T): void {
    for (const fn of this.deleteHandlers) fn(id, oldValue);
  }

  private emitSet(id: EntityId, value: T): void {
    for (const fn of this.setHandlers) fn(id, value);
  }

  private emitValidate(id: EntityId): void {
    for (const fn of this.validateHandlers) fn(id);
  }

  entries(): MapIterator<[EntityId, T]> { return this.map.entries(); }

  /** Reconstruct a store from serialized `[id, value]` tuples. */
  static fromSerialized<T>(
    raw: unknown,
    label: string,
    def: ComponentDef<T>,
  ): ComponentStore<T> {
    const store = new ComponentStore<T>();
    const entries = asArray(raw, label);

    entries.forEach((entry, index) => {
      const tuple = asArray(entry, `${label}[${index}]`);
      if (tuple.length !== 2) {
        throw new Error(`${label}[${index}] must contain an id and value.`);
      }
      const id = asNumber(tuple[0], `${label}[${index}].id`);
      store.set(id, def.deserialize(tuple[1], `${label}[${index}].value`));
    });

    return store;
  }

  get(id: EntityId): T | undefined { return this.map.get(id); }

  has(id: EntityId): boolean { return this.map.has(id); }
  hasChanges(): boolean { return this.dirty.size > 0; }
  isDirty(id: EntityId): boolean { return this.dirty.has(id); }

  keys(): MapIterator<EntityId> { return this.map.keys(); }

  markDirty(id: EntityId): void { this.dirty.add(id); }
  /** Insert or replace a component value. Fires validate → delete (if replacing) → set handlers. */
  set(id: EntityId, value: T): this {
    this.emitValidate(id);
    if (this.deleteHandlers.length > 0) {
      const old = this.map.get(id);
      if (old !== undefined)
        this.emitDelete(id, old);
    }
    this.map.set(id, value);
    this.dirty.add(id);
    this.emitSet(id, value);
    return this;
  }

  get size(): number { return this.map.size; }
  /**
   * Register a handler for a store event. Returns an unsubscribe function.
   * Multiple handlers per event are supported; they run in registration order.
   */
  subscribe(event: 'set', fn: StoreSetHandler<T>): () => void;
  subscribe(event: 'delete', fn: StoreDeleteHandler<T>): () => void;
  subscribe(event: 'validate', fn: StoreValidateHandler): () => void;
  subscribe(event: 'set' | 'delete' | 'validate', fn: (...args: never[]) => void): () => void {
    const list = (
      event === 'set'
        ? this.setHandlers
        : event === 'delete'
          ? this.deleteHandlers
          : this.validateHandlers
    ) as Array<(...args: never[]) => void>;
    list.push(fn);
    return () => {
      const i = list.indexOf(fn);
      if (i >= 0)
        list.splice(i, 1);
    };
  }

  [Symbol.iterator](): MapIterator<[EntityId, T]> { return this.map[Symbol.iterator](); }

  /** Serialize all entries as `[id, serializedValue]` tuples for persistence. */
  toSerialized(def: ComponentDef<T>): Array<[EntityId, unknown]> {
    return Array.from(this.map.entries(), ([id, value]) => [id, def.serialize(value)]);
  }

  /** Fire all `validate` handlers for a given id. Used by World for post-spawn dependency checks. */
  validate(id: EntityId): void {
    this.emitValidate(id);
  }
}

/** Boolean-only store — tracks entity presence without associated data. Supports dirty-tracking. */
export class TagStore implements Iterable<EntityId> {
  private readonly dirty = new Set<EntityId>();
  private readonly set = new Set<EntityId>();

  add(id: EntityId): this {
    this.set.add(id);
    this.dirty.add(id);
    return this;
  }

  clear(): void {
    this.set.clear();
    this.dirty.clear();
  }

  clearDirty(): void { this.dirty.clear(); }

  delete(id: EntityId): boolean {
    const ok = this.set.delete(id);
    if (ok)
      this.dirty.add(id);
    return ok;
  }

  /** Reconstruct a tag store from a serialized array of entity IDs. */
  static fromSerialized(raw: unknown, label: string): TagStore {
    const store = new TagStore();
    const entries = asArray(raw, label);
    entries.forEach((entry, index) => {
      store.add(asNumber(entry, `${label}[${index}]`));
    });
    return store;
  }

  has(id: EntityId): boolean { return this.set.has(id); }

  hasChanges(): boolean { return this.dirty.size > 0; }

  isDirty(id: EntityId): boolean { return this.dirty.has(id); }
  get size(): number { return this.set.size; }

  [Symbol.iterator](): SetIterator<EntityId> { return this.set[Symbol.iterator](); }

  /** Serialize as an array of entity IDs for persistence. */
  toSerialized(): EntityId[] {
    return [...this.set];
  }
}
