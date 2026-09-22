import type { ComponentDef, ComponentStoreLike, StoreDeleteHandler, StoreSetHandler, StoreValidateHandler } from '#component-store';
import type { EntityId } from '#entity-id';

/**
 * Structure-of-Arrays store for all-numeric components — the columnar half of
 * the hybrid storage model (see docs/plans/ecs-parallelism-and-soa-storage.md,
 * target "Middle"). Each declared field is a contiguous `Float32Array`
 * (a "column") indexed by a dense slot; an entity ↔ slot table maps ids to
 * slots. Deletion is swap-remove, so live slots stay `[0, size)` and dense.
 *
 * Implements the same access surface as {@link ComponentStore} (`get` / `set` /
 * `delete` / iteration / `subscribe` / dirty tracking / `toSerialized`) so
 * `world`, `QueryBuilder`, the spatial index, and save treat it identically.
 * The compatibility `get(id)` returns a **write-through view**: a small object
 * whose field accessors read and write the underlying columns, so the universal
 * `pos.x += …` mutate-in-place idiom keeps working. Hot loops that want the full
 * zero-allocation win use the columnar fast path ({@link column} + {@link slotOf}).
 */
export class ColumnStore<T> implements ComponentStoreLike<T> {
  private capacity = 16;
  private readonly columns: Record<string, Float32Array> = {};
  private count = 0;
  private readonly deleteHandlers: StoreDeleteHandler<T>[] = [];
  private readonly dirty = new Set<EntityId>();
  private readonly fields: string[];
  private readonly id2slot = new Map<EntityId, number>();
  private readonly setHandlers: StoreSetHandler<T>[] = [];
  private readonly slot2id: EntityId[] = [];
  private readonly validateHandlers: StoreValidateHandler[] = [];
  private readonly viewDescriptors: PropertyDescriptorMap = {};

  constructor(fields: readonly string[]) {
    this.fields = [...fields];
    for (const f of this.fields) this.columns[f] = new Float32Array(this.capacity);

    // Capture the backing references (not `this`) so view accessors stay
    // correct across grow() — `columns[f]` is reassigned in place on the same
    // Record, and `dirty` / `slot2id` references are stable.
    const { columns, dirty, id2slot } = this;
    for (const f of this.fields) {
      this.viewDescriptors[f] = {
        enumerable: true,
        get(this: { _id: EntityId }): number {
          return columns[f][id2slot.get(this._id)!];
        },
        set(this: { _id: EntityId }, v: number): void {
          const slot = id2slot.get(this._id);
          if (slot !== undefined) {
            columns[f][slot] = v;
            dirty.add(this._id);
          }
        },
      };
    }
  }

  clear(): void {
    if (this.deleteHandlers.length > 0) {
      for (let slot = 0; slot < this.count; slot++) {
        this.emitDelete(this.slot2id[slot], this.plainAt(slot));
      }
    }
    this.count = 0;
    this.id2slot.clear();
    this.slot2id.length = 0;
    this.dirty.clear();
  }

  clearDirty(): void { this.dirty.clear(); }

  /** Raw backing array for a field. Valid indices are `[0, size)`; pair with {@link slotOf}. */
  column(field: string): Float32Array { return this.columns[field]; }

  delete(id: EntityId): boolean {
    const slot = this.id2slot.get(id);
    if (slot === undefined)
      return false;

    const old = this.deleteHandlers.length > 0 ? this.plainAt(slot) : undefined;

    const lastSlot = this.count - 1;
    if (slot !== lastSlot) {
      for (const f of this.fields) this.columns[f][slot] = this.columns[f][lastSlot];
      const lastId = this.slot2id[lastSlot];
      this.slot2id[slot] = lastId;
      this.id2slot.set(lastId, slot);
    }
    this.slot2id.length = lastSlot;
    this.id2slot.delete(id);
    this.count = lastSlot;
    this.dirty.add(id);

    if (old !== undefined)
      this.emitDelete(id, old);
    return true;
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

  * entries(): Generator<[EntityId, T]> {
    for (let slot = 0; slot < this.count; slot++) {
      const id = this.slot2id[slot];
      yield [id, this.makeView(id)];
    }
  }

  get(id: EntityId): T | undefined {
    return this.id2slot.has(id) ? this.makeView(id) : undefined;
  }

  private grow(): void {
    this.capacity *= 2;
    for (const f of this.fields) {
      const next = new Float32Array(this.capacity);
      next.set(this.columns[f]);
      this.columns[f] = next;
    }
  }

  has(id: EntityId): boolean { return this.id2slot.has(id); }
  hasChanges(): boolean { return this.dirty.size > 0; }
  isDirty(id: EntityId): boolean { return this.dirty.has(id); }
  keys(): MapIterator<EntityId> { return this.id2slot.keys(); }

  /** Per-call write-through view bound to the entity id, so it survives slot moves caused by other deletes (swap-remove). */
  private makeView(id: EntityId): T {
    const v = {};
    Object.defineProperty(v, '_id', { value: id });
    Object.defineProperties(v, this.viewDescriptors);
    return v as T;
  }

  markDirty(id: EntityId): void { this.dirty.add(id); }

  private plainAt(slot: number): T {
    const out: Record<string, number> = {};
    for (const f of this.fields) out[f] = this.columns[f][slot];
    return out as T;
  }

  /** Insert or replace a component value. Fires validate → delete (if replacing) → set handlers. */
  set(id: EntityId, value: T): this {
    this.emitValidate(id);
    const existing = this.id2slot.get(id);
    let slot: number;
    if (existing === undefined) {
      if (this.count === this.capacity)
        this.grow();
      slot = this.count++;
      this.id2slot.set(id, slot);
      this.slot2id[slot] = id;
    }
    else {
      if (this.deleteHandlers.length > 0)
        this.emitDelete(id, this.plainAt(existing));
      slot = existing;
    }
    const src = value as Record<string, number>;
    for (const f of this.fields) this.columns[f][slot] = src[f];
    this.dirty.add(id);
    this.emitSet(id, value);
    return this;
  }

  get size(): number { return this.count; }

  /** Dense slot index for an entity, or `undefined`. Pair with {@link column} for fast loops. */
  slotOf(id: EntityId): number | undefined { return this.id2slot.get(id); }

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

  [Symbol.iterator](): Generator<[EntityId, T]> { return this.entries(); }

  /**
   * Serialize all entries for persistence. Same shape as
   * {@link ComponentStore.toSerialized} (a plain `[id, value]` tuple array when
   * unversioned, or `{ version, entries }` when `def.version > 0`) with the
   * same entries — but in **slot order**, which after any delete (swap-remove)
   * differs from the object store's insertion order. Loading is order-
   * independent, so round-trips are correct.
   */
  toSerialized(def: ComponentDef<T>): unknown {
    const entries: [EntityId, unknown][] = [];
    for (let slot = 0; slot < this.count; slot++) {
      entries.push([this.slot2id[slot], def.serialize(this.plainAt(slot))]);
    }
    const v = def.version ?? 0;
    if (v === 0)
      return entries;
    return { entries, version: v };
  }

  /** Fire all `validate` handlers for a given id. Used by World for post-spawn dependency checks. */
  validate(id: EntityId): void {
    this.emitValidate(id);
  }
}
