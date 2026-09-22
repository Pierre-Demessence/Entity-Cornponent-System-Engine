import type { ColumnField, ComponentDef, ComponentStoreLike, NumericColumnKind, StoreDeleteHandler, StoreSetHandler, StoreValidateHandler } from '#component-store';
import type { EntityId } from '#entity-id';

// Paged sparse set for id -> slot. Pages of Int32Array are allocated on demand
// (only where live ids fall), so lookup is a GC-leaf typed-array read instead of
// a millions-entry Map, and memory stays bounded to the id ranges actually used.
const PAGE_BITS = 12;
const PAGE_SIZE = 1 << PAGE_BITS; // 4096 ids per page
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
 * the hybrid storage model (see docs/plans/ecs-parallelism-and-soa-storage.md,
 * target "Middle"). Each declared field is a contiguous typed-array "column"
 * (element type per {@link ColumnField.kind}) indexed by a dense slot; a paged
 * sparse set maps ids to slots. Deletion is swap-remove, so live slots stay
 * `[0, size)` and dense.
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
  private readonly colKinds: Record<string, NumericColumnKind> = {};
  private readonly columns: Record<string, NumericArray> = {};
  private count = 0;
  private readonly deleteHandlers: StoreDeleteHandler<T>[] = [];
  private readonly dirty = new Set<EntityId>();
  private readonly fields: string[];
  private readonly pages: (Int32Array | undefined)[] = [];
  private readonly setHandlers: StoreSetHandler<T>[] = [];
  private readonly shared: boolean;
  private readonly slot2id: EntityId[] = [];
  private readonly validateHandlers: StoreValidateHandler[] = [];
  private readonly viewDescriptors: PropertyDescriptorMap = {};

  constructor(specs: readonly ColumnField[], options: ColumnStoreOptions = {}) {
    this.shared = options.shared ?? false;
    this.fields = specs.map(s => s.field);
    for (const s of specs) {
      this.colKinds[s.field] = s.kind;
      this.columns[s.field] = makeColumn(s.kind, this.capacity, this.shared);
    }

    // Capture the backing references (not `this`) so view accessors stay
    // correct across grow() — `columns[f]` is reassigned in place on the same
    // Record, and `dirty` / `pages` references are stable.
    const { columns, dirty, pages } = this;
    for (const f of this.fields) {
      this.viewDescriptors[f] = {
        enumerable: true,
        get(this: { _id: EntityId }): number {
          const page = pages[this._id >>> PAGE_BITS];
          return columns[f][page === undefined ? ABSENT : page[this._id & PAGE_MASK]];
        },
        set(this: { _id: EntityId }, v: number): void {
          const page = pages[this._id >>> PAGE_BITS];
          const slot = page === undefined ? ABSENT : page[this._id & PAGE_MASK];
          if (slot !== ABSENT) {
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
    this.pages.length = 0;
    this.slot2id.length = 0;
    this.dirty.clear();
  }

  clearDirty(): void { this.dirty.clear(); }

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
      const lastId = this.slot2id[lastSlot];
      this.slot2id[slot] = lastId;
      this.setSparse(lastId, slot);
    }
    this.setSparse(id, ABSENT);
    this.slot2id.length = lastSlot;
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
    return this.slotFor(id) === ABSENT ? undefined : this.makeView(id);
  }

  private grow(): void {
    this.capacity *= 2;
    for (const f of this.fields) {
      const next = makeColumn(this.colKinds[f], this.capacity, this.shared);
      next.set(this.columns[f]);
      this.columns[f] = next;
    }
  }

  has(id: EntityId): boolean { return this.slotFor(id) !== ABSENT; }
  hasChanges(): boolean { return this.dirty.size > 0; }
  isDirty(id: EntityId): boolean { return this.dirty.has(id); }
  * keys(): Generator<EntityId> {
    for (let slot = 0; slot < this.count; slot++) yield this.slot2id[slot];
  }

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
    const existing = this.slotFor(id);
    let slot: number;
    if (existing === ABSENT) {
      if (this.count === this.capacity)
        this.grow();
      slot = this.count++;
      this.setSparse(id, slot);
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

  /** Sparse-set write: allocate the id's page on demand, then record its slot. */
  private setSparse(id: EntityId, slot: number): void {
    const p = id >>> PAGE_BITS;
    let page = this.pages[p];
    if (page === undefined) {
      page = new Int32Array(PAGE_SIZE).fill(ABSENT);
      this.pages[p] = page;
    }
    page[id & PAGE_MASK] = slot;
  }

  get size(): number { return this.count; }

  /** Sparse-set lookup: dense slot for an entity id, or {@link ABSENT}. */
  private slotFor(id: EntityId): number {
    const page = this.pages[id >>> PAGE_BITS];
    return page === undefined ? ABSENT : page[id & PAGE_MASK];
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
}
