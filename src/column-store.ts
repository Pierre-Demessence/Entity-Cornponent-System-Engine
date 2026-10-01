import type { ColumnField, ComponentDef, ComponentStoreLike, NumericColumnKind, StoreDeleteHandler, StoreSetHandler, StoreValidateHandler } from '#component-store';
import type { EntityId } from '#entity-id';

import { ChangeClock } from '#change-clock';
import { entityIndex, formatEntityId } from '#entity-id';

// Paged sparse set for entity index -> slot. Pages of Int32Array are allocated
// on demand (only where live indices fall), so lookup is a GC-leaf typed-array
// read instead of a millions-entry Map. Recycled indices keep the pages dense.
const PAGE_BITS = 12;
const PAGE_SIZE = 1 << PAGE_BITS; // 4096 indices per page
const PAGE_MASK = PAGE_SIZE - 1;
const ABSENT = -1;

type NumericArray = Float32Array | Float64Array | Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array;

const COLUMN_CTORS = {
  f32: Float32Array,
  f64: Float64Array,
  i8: Int8Array,
  i16: Int16Array,
  i32: Int32Array,
  u8: Uint8Array,
  u16: Uint16Array,
  u32: Uint32Array,
} as const;

function makeColumn(kind: NumericColumnKind, capacity: number, shared: boolean): NumericArray {
  const Ctor = COLUMN_CTORS[kind];
  if (shared) {
    if (typeof SharedArrayBuffer === 'undefined') {
      throw new TypeError('Shared columns require SharedArrayBuffer — enable cross-origin isolation (COOP/COEP headers).');
    }
    // Typed arrays accept a SharedArrayBuffer at runtime; the cast sidesteps the
    // union-constructor overload that only sees `ArrayBuffer`.
    const buffer = new SharedArrayBuffer(capacity * Ctor.BYTES_PER_ELEMENT) as unknown as ArrayBuffer;
    return new Ctor(buffer);
  }
  return new Ctor(capacity);
}

/** Options for {@link ColumnStore}. */
export interface ColumnStoreOptions {
  /** Stamp source for change ticks; a world passes its shared clock. Defaults to a private one. */
  clock?: ChangeClock;
  /**
   * Back each column with a `SharedArrayBuffer` instead of a plain
   * `ArrayBuffer`, so worker threads can read/write the same memory with no
   * copy (the foundation for parallel dispatch — step B2). Requires
   * cross-origin isolation in the browser. Note: `grow()` reallocates the
   * buffers, so any worker views must be re-acquired after the store grows.
   */
  shared?: boolean;
}

/**
 * Structure-of-Arrays store for all-numeric components — the columnar half of
 * the hybrid storage model (see docs/decisions.md, "Hybrid component
 * storage"). Each declared field is a contiguous typed-array "column"
 * (element type per {@link ColumnField.kind}) indexed by a dense slot; a paged
 * sparse set maps ids to slots. Deletion is swap-remove, so live slots stay
 * `[0, size)` and dense.
 *
 * Implements the same access surface as {@link ComponentStore} (`get` / `set` /
 * `delete` / iteration / `subscribe` / change ticks / `toSerialized`) so
 * `world`, `Query`, the spatial index, and save treat it identically.
 * The compatibility `get(id)` returns a **write-through view**: a small object
 * whose field accessors read and write the underlying columns, so the universal
 * `pos.x += …` mutate-in-place idiom keeps working. The view is cached per
 * entity, so repeated `get(id)` calls return the same object until the row is
 * deleted. Hot loops that want the full
 * zero-allocation win use the columnar fast path ({@link column} + {@link slotOf}).
 */
export class ColumnStore<T> implements ComponentStoreLike<T> {
  private capacity = 16;
  readonly clock: ChangeClock;
  private readonly colKinds: Record<string, NumericColumnKind> = {};
  private readonly columns: Record<string, NumericArray> = {};
  private count = 0;
  private readonly deleteHandlers: StoreDeleteHandler<T>[] = [];
  private readonly fields: string[];
  private readonly pages: (Int32Array | undefined)[] = [];
  private readonly setHandlers: StoreSetHandler<T>[] = [];
  private readonly shared: boolean;
  private readonly slot2id: EntityId[] = [];
  // Per-slot added / changed ticks, moved with the row on swap-remove. A Record
  // (like `columns`) so view accessors keep a stable reference across grow().
  private readonly stamps: { added: Float64Array; changed: Float64Array };
  private readonly validateHandlers: StoreValidateHandler[] = [];
  private readonly viewDescriptors: PropertyDescriptorMap = {};
  // One cached view per live id, paged like the sparse set. Building a view
  // (defineProperties) is far costlier than reading through one, so it is paid
  // once per entity instead of once per `get()`.
  private readonly viewPages: (T[] | undefined)[] = [];

  constructor(specs: readonly ColumnField[], options: ColumnStoreOptions = {}) {
    this.shared = options.shared ?? false;
    this.clock = options.clock ?? new ChangeClock();
    this.stamps = { added: new Float64Array(this.capacity), changed: new Float64Array(this.capacity) };
    this.fields = specs.map(s => s.field);
    for (const s of specs) {
      this.colKinds[s.field] = s.kind;
      this.columns[s.field] = makeColumn(s.kind, this.capacity, this.shared);
    }

    // Capture the backing references (not `this`) so view accessors stay
    // correct across grow() — `columns[f]` is reassigned in place on the same
    // Record, and `stamps` / `pages` / `clock` references are stable.
    const { clock, columns, pages, slot2id, stamps } = this;
    const slotOfView = (id: EntityId): number => {
      const index = entityIndex(id);
      const page = pages[index >>> PAGE_BITS];
      const slot = page === undefined ? ABSENT : page[index & PAGE_MASK];
      return slot !== ABSENT && slot2id[slot] === id ? slot : ABSENT;
    };
    for (const f of this.fields) {
      this.viewDescriptors[f] = {
        enumerable: true,
        get(this: { _id: EntityId }): number {
          return columns[f][slotOfView(this._id)];
        },
        set(this: { _id: EntityId }, v: number): void {
          const slot = slotOfView(this._id);
          if (slot !== ABSENT) {
            columns[f][slot] = v;
            stamps.changed[slot] = clock.tick;
          }
        },
      };
    }
  }

  addedTick(id: EntityId): number {
    const slot = this.slotFor(id);
    return slot === ABSENT ? 0 : this.stamps.added[slot];
  }

  changedTick(id: EntityId): number {
    const slot = this.slotFor(id);
    return slot === ABSENT ? 0 : this.stamps.changed[slot];
  }

  clear(): void {
    if (this.deleteHandlers.length > 0) {
      for (let slot = 0; slot < this.count; slot++) {
        this.emitDelete(this.slot2id[slot], this.plainAt(slot));
      }
    }
    this.count = 0;
    this.pages.length = 0;
    this.viewPages.length = 0;
    this.slot2id.length = 0;
  }

  /** Raw backing array for a field. Valid indices are `[0, size)`; pair with {@link slotOf}. */
  column(field: string): NumericArray { return this.columns[field]; }

  delete(id: EntityId): boolean {
    const slot = this.slotFor(id);
    if (slot === ABSENT)
      return false;

    const old = this.deleteHandlers.length > 0 ? this.plainAt(slot) : undefined;

    const lastSlot = this.count - 1;
    if (slot !== lastSlot) {
      for (const f of this.fields) this.columns[f][slot] = this.columns[f][lastSlot];
      this.stamps.added[slot] = this.stamps.added[lastSlot];
      this.stamps.changed[slot] = this.stamps.changed[lastSlot];
      const lastId = this.slot2id[lastSlot];
      this.slot2id[slot] = lastId;
      this.setSparse(lastId, slot);
    }
    this.setSparse(id, ABSENT);
    const index = entityIndex(id);
    const views = this.viewPages[index >>> PAGE_BITS];
    if (views !== undefined)
      views[index & PAGE_MASK] = undefined as T;
    this.slot2id.length = lastSlot;
    this.count = lastSlot;

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
      yield [id, this.viewFor(id)];
    }
  }

  get(id: EntityId): T | undefined {
    return this.slotFor(id) === ABSENT ? undefined : this.viewFor(id);
  }

  getMut(id: EntityId): T | undefined {
    const slot = this.slotFor(id);
    if (slot === ABSENT)
      return undefined;
    this.stamps.changed[slot] = this.clock.tick;
    return this.viewFor(id);
  }

  private grow(): void {
    this.capacity *= 2;
    for (const f of this.fields) {
      const next = makeColumn(this.colKinds[f], this.capacity, this.shared);
      next.set(this.columns[f]);
      this.columns[f] = next;
    }
    for (const key of ['added', 'changed'] as const) {
      const next = new Float64Array(this.capacity);
      next.set(this.stamps[key]);
      this.stamps[key] = next;
    }
  }

  has(id: EntityId): boolean { return this.slotFor(id) !== ABSENT; }
  /** The stored entity sharing `id`'s index, whatever its generation, or `undefined`. */
  private holderOf(id: EntityId): EntityId | undefined {
    const index = entityIndex(id);
    const page = this.pages[index >>> PAGE_BITS];
    const slot = page === undefined ? ABSENT : page[index & PAGE_MASK];
    return slot === ABSENT ? undefined : this.slot2id[slot];
  }

  * keys(): Generator<EntityId> {
    for (let slot = 0; slot < this.count; slot++) yield this.slot2id[slot];
  }

  /** Write-through view bound to the entity id (not its slot), so it survives slot moves caused by other deletes (swap-remove). */
  private makeView(id: EntityId): T {
    const v = {};
    Object.defineProperty(v, '_id', { value: id });
    Object.defineProperties(v, this.viewDescriptors);
    return v as T;
  }

  /** Record a present entity as changed — call after writing its row through {@link column}. */
  markChanged(id: EntityId): void {
    const slot = this.slotFor(id);
    if (slot !== ABSENT)
      this.stamps.changed[slot] = this.clock.tick;
  }

  private plainAt(slot: number): T {
    const out: Record<string, number> = {};
    for (const f of this.fields) out[f] = this.columns[f][slot];
    return out as T;
  }

  /** Insert or replace a component value. Fires validate → delete (if replacing) → set handlers. */
  set(id: EntityId, value: T): this {
    this.emitValidate(id);
    const existing = this.slotFor(id);
    let slot: number;
    if (existing === ABSENT) {
      const holder = this.holderOf(id);
      if (holder !== undefined)
        throw new Error(`ColumnStore.set: entity ${formatEntityId(id)} shares index ${entityIndex(id)} with stored entity ${formatEntityId(holder)}; a stale id cannot be written.`);
      if (this.count === this.capacity)
        this.grow();
      slot = this.count++;
      this.setSparse(id, slot);
      this.slot2id[slot] = id;
      this.stamps.added[slot] = this.clock.tick;
    }
    else {
      if (this.deleteHandlers.length > 0)
        this.emitDelete(id, this.plainAt(existing));
      slot = existing;
    }
    const src = value as Record<string, number>;
    for (const f of this.fields) this.columns[f][slot] = src[f];
    this.stamps.changed[slot] = this.clock.tick;
    this.emitSet(id, value);
    return this;
  }

  /** Sparse-set write: allocate the id's index page on demand, then record its slot. */
  private setSparse(id: EntityId, slot: number): void {
    const index = entityIndex(id);
    const p = index >>> PAGE_BITS;
    let page = this.pages[p];
    if (page === undefined) {
      page = new Int32Array(PAGE_SIZE).fill(ABSENT);
      this.pages[p] = page;
    }
    page[index & PAGE_MASK] = slot;
  }

  get size(): number { return this.count; }

  /**
   * Sparse-set lookup: dense slot for an entity id, or {@link ABSENT}. The
   * sparse set is keyed by index, so the slot's full id must match too — a
   * stale id whose index now holds a newer generation misses.
   */
  private slotFor(id: EntityId): number {
    const index = entityIndex(id);
    const page = this.pages[index >>> PAGE_BITS];
    const slot = page === undefined ? ABSENT : page[index & PAGE_MASK];
    return slot !== ABSENT && this.slot2id[slot] === id ? slot : ABSENT;
  }

  /** Dense slot index for an entity, or `undefined`. Pair with {@link column} for fast loops. */
  slotOf(id: EntityId): number | undefined {
    const slot = this.slotFor(id);
    return slot === ABSENT ? undefined : slot;
  }

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

  /** The cached view for a live id, built on first access. */
  private viewFor(id: EntityId): T {
    const index = entityIndex(id);
    const p = index >>> PAGE_BITS;
    let views = this.viewPages[p];
    if (views === undefined) {
      views = [];
      this.viewPages[p] = views;
    }
    let view = views[index & PAGE_MASK];
    if (view === undefined || (view as { _id: EntityId })._id !== id) {
      view = this.makeView(id);
      views[index & PAGE_MASK] = view;
    }
    return view;
  }
}
