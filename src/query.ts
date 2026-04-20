import type { ComponentStore, TagStore } from '#component-store';
import type { EntityId } from '#entity-id';

/**
 * Fluent, iterable query over component stores with tag filtering.
 * Iterates the smallest store first for performance.
 */
export class QueryBuilder<T extends unknown[]> {
  private excludedTags: TagStore[] = [];
  private requiredTags: TagStore[] = [];
  private stores: ComponentStore<unknown>[];

  constructor(stores: ComponentStore<unknown>[]) {
    this.stores = stores;
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

    let smallestIdx = 0;
    for (let i = 1; i < this.stores.length; i++) {
      if (this.stores[i].size < this.stores[smallestIdx].size)
        smallestIdx = i;
    }

    // eslint-disable-next-line no-labels -- intentional labeled break for nested-loop query engine
    outer:
    for (const id of this.stores[smallestIdx].keys()) {
      const values: unknown[] = Array.from({ length: this.stores.length });
      for (let i = 0; i < this.stores.length; i++) {
        if (i === smallestIdx) {
          values[i] = this.stores[i].get(id);
          continue;
        }
        const val = this.stores[i].get(id);
        if (val === undefined)
          continue outer; // eslint-disable-line no-labels
        values[i] = val;
      }

      for (const tag of this.requiredTags) {
        if (!tag.has(id))
          continue outer; // eslint-disable-line no-labels
      }
      for (const tag of this.excludedTags) {
        if (tag.has(id))
          continue outer; // eslint-disable-line no-labels
      }

      yield [id, ...values] as [EntityId, ...T];
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
