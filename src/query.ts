import type { ArchetypeIndex } from '#archetype-index';
import type { ComponentStoreLike, TagStore } from '#component-store';
import type { EntityId } from '#entity-id';

/**
 * Fluent, iterable query over component stores with tag filtering.
 *
 * When constructed with an {@link ArchetypeIndex} (the `world.query` path), it
 * selects matching archetype buckets by signature — no per-entity store
 * probing. Constructed without one (standalone), it falls back to scanning the
 * smallest store and probing the rest. Both paths return identical results.
 */
export class QueryBuilder<T extends unknown[]> {
  private excludedTags: TagStore[] = [];
  private readonly index: ArchetypeIndex | undefined;
  private requiredTags: TagStore[] = [];
  private stores: ComponentStoreLike<unknown>[];

  constructor(stores: ComponentStoreLike<unknown>[], index?: ArchetypeIndex) {
    this.stores = stores;
    this.index = index;
  }

  /**
   * OR the archetype bits of the required stores/tags and the excluded tags.
   * Returns `undefined` if any store lacks a bit (not index-registered), so the
   * caller falls back to the scan path.
   */
  private computeMasks(index: ArchetypeIndex): { excluded: bigint; required: bigint } | undefined {
    let required = 0n;
    for (const store of this.stores) {
      const bit = index.bitOf(store);
      if (bit === undefined)
        return undefined;
      required |= bit;
    }
    for (const tag of this.requiredTags) {
      const bit = index.bitOf(tag);
      if (bit === undefined)
        return undefined;
      required |= bit;
    }
    let excluded = 0n;
    for (const tag of this.excludedTags) {
      const bit = index.bitOf(tag);
      if (bit === undefined)
        return undefined;
      excluded |= bit;
    }
    return { excluded, required };
  }

  /** Count matching entities without allocating a results array. */
  count(): number {
    let n = 0;
    for (const _ of this) n++;
    return n;
  }

  /** Return the first match, or `undefined` if none. */
  first(): [EntityId, ...T] | undefined {
    // eslint-disable-next-line no-unreachable-loop -- intentional: grab first match
    for (const result of this) return result;
    return undefined;
  }

  /** Collect all matching results into an array. */
  run(): Array<[EntityId, ...T]> {
    return [...this];
  }

  * [Symbol.iterator](): Generator<[EntityId, ...T]> {
    if (this.stores.length === 0)
      return;

    const masks = this.index ? this.computeMasks(this.index) : undefined;
    if (this.index && masks) {
      const width = this.stores.length;
      for (const id of this.index.matching(masks.required, masks.excluded)) {
        // The archetype guarantees every required store holds `id`, so we build
        // the tuple with one get() per store and no membership probing.
        const result: unknown[] = [id];
        for (let i = 0; i < width; i++)
          result.push(this.stores[i].get(id));
        yield result as [EntityId, ...T];
      }
      return;
    }

    let smallestIdx = 0;
    for (let i = 1; i < this.stores.length; i++) {
      if (this.stores[i].size < this.stores[smallestIdx].size)
        smallestIdx = i;
    }

    const width = this.stores.length;
    // eslint-disable-next-line no-labels -- intentional labeled break for nested-loop query engine
    outer:
    for (const id of this.stores[smallestIdx].keys()) {
      // Cheap rejects first (membership + tags) so we never build a component
      // view or the result tuple for a non-matching entity.
      for (let i = 0; i < width; i++) {
        if (i !== smallestIdx && !this.stores[i].has(id))
          continue outer; // eslint-disable-line no-labels
      }
      for (const tag of this.requiredTags) {
        if (!tag.has(id))
          continue outer; // eslint-disable-line no-labels
      }
      for (const tag of this.excludedTags) {
        if (tag.has(id))
          continue outer; // eslint-disable-line no-labels
      }

      // Match: a single result tuple built by push — one get() per store, no
      // intermediate array, no spread.
      const result: unknown[] = [id];
      for (let i = 0; i < width; i++)
        result.push(this.stores[i].get(id));
      yield result as [EntityId, ...T];
    }
  }

  /** Exclude entities that have any of the given tags. */
  without(...tags: TagStore[]): this {
    this.excludedTags.push(...tags);
    return this;
  }

  /** Require entities to have all given tags. */
  withTag(...tags: TagStore[]): this {
    this.requiredTags.push(...tags);
    return this;
  }
}
