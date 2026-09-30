import type { EntityId } from '#entity-id';

import {
  ENTITY_GENERATION_MAX,
  ENTITY_INDEX_MAX,
  entityGeneration,
  entityIndex,
  packEntityId,
} from '#entity-id';
import { asArray, asNumber, asObject } from '#validation';

const FREE = 0;
const RESERVED = 1;
const LIVE = 2;
const RETIRED = 3;

/** Allocator state as written by {@link EntityAllocator.toSerialized}. */
export interface SerializedEntityAllocator {
  free: number[];
  generations: number[];
  highWater: number;
  retired: number[];
}

/**
 * Hands out {@link EntityId}s and recycles destroyed ones. A released index
 * goes on a LIFO free list with its generation bumped, so a stale handle never
 * matches the index's next occupant; an index released at the maximum
 * generation is retired instead of wrapping.
 *
 * An id is *reserved* by {@link allocate} and becomes *live* on
 * {@link activate}, which lets a deferred spawn hold its id before it exists.
 */
export class EntityAllocator {
  private free: number[] = [];
  private generations = new Uint8Array(64);
  private highWater = 0;
  private liveCount = 0;
  private states = new Uint8Array(64);

  /** Mark a reserved id live. Throws unless `id` is currently reserved. */
  activate(id: EntityId): void {
    const index = entityIndex(id);
    if (!this.holds(id) || this.states[index] !== RESERVED)
      throw new Error(`Entity ${id} is not reserved`);
    this.states[index] = LIVE;
    this.liveCount++;
  }

  /** Reserve a fresh id: the most recently freed index, else a new one. */
  allocate(): EntityId {
    let index = this.free.pop();
    if (index === undefined) {
      if (this.highWater > ENTITY_INDEX_MAX)
        throw new Error(`Entity index space exhausted (${ENTITY_INDEX_MAX + 1} indices)`);
      index = this.highWater++;
      this.ensureCapacity(this.highWater);
    }
    this.states[index] = RESERVED;
    return packEntityId(index, this.generations[index]!);
  }

  /**
   * Make exactly `id` live, e.g. to keep an entity's id when it moves between
   * worlds. A no-op when `id` is already live. Throws when its index is held by
   * another entity, retired, or free at a newer generation than `id`'s —
   * adopting an older generation would revive handles already known stale.
   */
  claim(id: EntityId): void {
    const index = entityIndex(id);
    const generation = entityGeneration(id);
    if (index >= this.highWater) {
      this.ensureCapacity(index + 1);
      for (let i = index - 1; i >= this.highWater; i--) this.free.push(i);
      this.highWater = index + 1;
    }
    else {
      const state = this.states[index];
      if (state === RETIRED)
        throw new Error(`Cannot claim entity ${id}: index ${index} is retired`);
      if (state === LIVE && this.generations[index] === generation)
        return;
      if (state !== FREE)
        throw new Error(`Cannot claim entity ${id}: index ${index} is in use`);
      if (generation < this.generations[index]!)
        throw new Error(`Cannot claim entity ${id}: older generation than index ${index}'s ${this.generations[index]}`);
      this.free.splice(this.free.lastIndexOf(index), 1);
    }
    this.generations[index] = generation;
    this.states[index] = LIVE;
    this.liveCount++;
  }

  /** Forget every id; the next allocation starts again at index 0, generation 0. */
  clear(): void {
    this.free = [];
    this.generations = new Uint8Array(64);
    this.highWater = 0;
    this.liveCount = 0;
    this.states = new Uint8Array(64);
  }

  private ensureCapacity(length: number): void {
    if (length <= this.states.length)
      return;
    let capacity = this.states.length;
    while (capacity < length) capacity *= 2;
    const generations = new Uint8Array(capacity);
    generations.set(this.generations);
    this.generations = generations;
    const states = new Uint8Array(capacity);
    states.set(this.states);
    this.states = states;
  }

  /** Rebuild an allocator from {@link toSerialized} output. Throws on a malformed payload. */
  static fromSerialized(raw: unknown, label: string): EntityAllocator {
    const source = asObject(raw, label);
    const highWater = asNumber(source.highWater, `${label}.highWater`);
    if (!Number.isInteger(highWater) || highWater < 0 || highWater > ENTITY_INDEX_MAX + 1)
      throw new Error(`${label}.highWater: expected an integer in [0, ${ENTITY_INDEX_MAX + 1}], got ${highWater}`);
    const generations = asArray(source.generations, `${label}.generations`);
    if (generations.length !== highWater)
      throw new Error(`${label}.generations: expected ${highWater} entries, got ${generations.length}`);

    const alloc = new EntityAllocator();
    alloc.ensureCapacity(highWater);
    alloc.highWater = highWater;
    generations.forEach((value, index) => {
      const generation = asNumber(value, `${label}.generations[${index}]`);
      if (!Number.isInteger(generation) || generation < 0 || generation > ENTITY_GENERATION_MAX)
        throw new Error(`${label}.generations[${index}]: generation ${generation} out of range`);
      alloc.generations[index] = generation;
      alloc.states[index] = LIVE;
    });

    const readIndices = (key: 'free' | 'retired', state: number): number[] =>
      asArray(source[key], `${label}.${key}`).map((value, i) => {
        const index = asNumber(value, `${label}.${key}[${i}]`);
        if (!Number.isInteger(index) || index < 0 || index >= highWater)
          throw new Error(`${label}.${key}[${i}]: index ${index} out of range`);
        if (alloc.states[index] !== LIVE)
          throw new Error(`${label}.${key}[${i}]: index ${index} listed twice (free/retired overlap)`);
        alloc.states[index] = state;
        return index;
      });
    alloc.free = readIndices('free', FREE);
    readIndices('retired', RETIRED);
    alloc.liveCount = highWater - alloc.free.length - asArray(source.retired, `${label}.retired`).length;
    return alloc;
  }

  /** Whether `id` matches its index's current generation. */
  private holds(id: EntityId): boolean {
    const index = entityIndex(id);
    return index < this.highWater && this.generations[index] === entityGeneration(id);
  }

  /** Whether `id` is live: activated and not released since. */
  isAlive(id: EntityId): boolean {
    return this.holds(id) && this.states[entityIndex(id)] === LIVE;
  }

  /** Iterate the live ids in index order. */
  * live(): IterableIterator<EntityId> {
    for (let index = 0; index < this.highWater; index++) {
      if (this.states[index] === LIVE)
        yield packEntityId(index, this.generations[index]!);
    }
  }

  /**
   * Release a live `id`: its index is freed with a bumped generation, or
   * retired at the maximum generation. Returns `false`, changing nothing, when
   * `id` is not live (stale, reserved, released, or never allocated).
   */
  release(id: EntityId): boolean {
    if (!this.isAlive(id))
      return false;
    this.retire(entityIndex(id));
    this.liveCount--;
    return true;
  }

  private retire(index: number): void {
    if (this.generations[index] === ENTITY_GENERATION_MAX) {
      this.states[index] = RETIRED;
      return;
    }
    this.generations[index]!++;
    this.states[index] = FREE;
    this.free.push(index);
  }

  /** Number of live entities. */
  get size(): number {
    return this.liveCount;
  }

  /**
   * Snapshot for saving. A reserved id whose entity was never activated is
   * written as released, so references to it stay stale after a reload.
   */
  toSerialized(): SerializedEntityAllocator {
    const generations = Array.from(this.generations.subarray(0, this.highWater));
    const free = [...this.free];
    const retired: number[] = [];
    for (let index = 0; index < this.highWater; index++) {
      const state = this.states[index];
      if (state === RETIRED) {
        retired.push(index);
      }
      else if (state === RESERVED) {
        if (generations[index] === ENTITY_GENERATION_MAX) {
          retired.push(index);
        }
        else {
          generations[index]!++;
          free.push(index);
        }
      }
    }
    return { free, generations, highWater: this.highWater, retired };
  }
}
