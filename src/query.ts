import type { ArchetypeIndex } from '#archetype-index';
import type { ChangeClock } from '#change-clock';
import type { ComponentStoreLike, TagStore } from '#component-store';
import type { EntityId } from '#entity-id';

/**
 * The read-only surface the non-yielded filter methods touch — omits the
 * invariant `set`, so a typed `ComponentStore<T>` is accepted without a cast
 * to `ComponentStoreLike<unknown>`.
 */
type ComponentFilter = Pick<ComponentStoreLike<unknown>, 'has' | 'keys' | 'size'>;

/** A member of an any-of group or a mandatory scan source: a component or tag store. */
type FilterStore = ComponentFilter | TagStore;

/** A store an {@link Query.added} filter reads: a component or tag store. */
type AddedSource = Pick<ComponentStoreLike<unknown>, 'addedTick' | 'clock' | 'has' | 'keys' | 'size'> | TagStore;

/** A store a {@link Query.changed} filter reads. */
type ChangedSource = Pick<ComponentStoreLike<unknown>, 'changedTick' | 'clock' | 'has' | 'keys' | 'size'>;

interface Masks {
  anyOf: bigint[];
  excluded: bigint;
  required: bigint;
}

/**
 * What a query derives from its filters on the first pass and reuses after:
 * the change clock, the archetype masks (`undefined` when a filter store has
 * no index bit, so passes fall back to scanning), and the matched bucket list
 * together with the index version it was selected at.
 */
interface Resolved {
  buckets: readonly Set<EntityId>[];
  bucketsVersion: number;
  clock: ChangeClock | undefined;
  masks: Masks | undefined;
}

/** Resolve an entity-id iterable from a mandatory source (component or tag store). */
function idsOf(member: FilterStore): Iterable<EntityId> {
  return 'keys' in member ? member.keys() : member;
}

/**
 * Fluent, iterable query over component stores with tag and component filters.
 *
 * When constructed with an {@link ArchetypeIndex} (the `world.query` path), it
 * selects matching archetype buckets by signature — no per-entity store
 * probing. Constructed without one (standalone), it falls back to scanning the
 * smallest mandatory store and probing the rest. Both paths return identical
 * results.
 *
 * The constructor stores are the **data** columns: they are required and their
 * values are yielded in order. The fluent methods add filters that are not
 * yielded ({@link withComponent}, {@link withoutComponent}, {@link withTag},
 * {@link without}, {@link anyOf}) or an extra yielded column that may be absent
 * ({@link optional}).
 *
 * A query is a reusable handle: build it once and iterate it every tick. The
 * first pass resolves its filters against the archetype index and later passes
 * reuse that resolution, re-resolving only when a filter is added or the set
 * of archetypes changes. A query with an {@link added} or {@link changed}
 * filter is also stateful: each pass reports what happened since this
 * instance's previous pass, so a query rebuilt per tick sees every entity as
 * new on each pass.
 */
export class Query<T extends unknown[]> {
  private addedFilters: AddedSource[] = [];
  private anyOfGroups: FilterStore[][] = [];
  private changedFilters: ChangedSource[] = [];
  private excludedComponents: ComponentFilter[] = [];
  private excludedTags: TagStore[] = [];
  private readonly index: ArchetypeIndex | undefined;
  private lastRun = 0;
  private optionalStores: ComponentStoreLike<unknown>[] = [];
  private requiredComponents: ComponentFilter[] = [];
  private requiredTags: TagStore[] = [];
  private resolved: Resolved | undefined;
  private stores: ComponentStoreLike<unknown>[];

  constructor(stores: ComponentStoreLike<unknown>[], index?: ArchetypeIndex) {
    this.stores = stores;
    this.index = index;
  }

  /**
   * Match only entities that gained `store` (a component or tag) since this
   * query's previous pass (Bevy `Added<T>`). Implicitly requires `store`. A
   * value replace is not an addition; removing and re-adding is.
   */
  added(store: AddedSource): this {
    this.resolved = undefined;
    this.addedFilters.push(store);
    if ('keys' in store)
      this.requiredComponents.push(store);
    else
      this.requiredTags.push(store);
    return this;
  }

  /**
   * Match entities holding **at least one** member of the group (Bevy `Or`,
   * DOTS `WithAny`). Each call adds one group; groups AND together. Members may
   * be component stores or tag stores.
   */
  anyOf(...members: FilterStore[]): this {
    if (members.length > 0) {
      this.resolved = undefined;
      this.anyOfGroups.push(members);
    }
    return this;
  }

  /**
   * Build the yielded tuple for a matched entity: the id, then one value per
   * data store, then one value (possibly `undefined`) per optional store.
   */
  private buildResult(id: EntityId): [EntityId, ...T] {
    const result: unknown[] = [id];
    for (const store of this.stores)
      result.push(store.get(id));
    for (const store of this.optionalStores)
      result.push(store.get(id));
    return result as [EntityId, ...T];
  }

  /**
   * Match only entities whose `store` component was inserted or changed since
   * this query's previous pass (Bevy `Changed<T>`). Implicitly requires
   * `store`. A change is a `set()`, a `getMut()`, a columnar view field write,
   * or a `markChanged()`; mutating the object returned by `get()` is not.
   * Removal is not a change — observe it through lifecycle events.
   */
  changed(store: ChangedSource): this {
    this.resolved = undefined;
    this.changedFilters.push(store);
    this.requiredComponents.push(store);
    return this;
  }

  /** Test the added / changed filters against an entity; `since` undefined means none apply. */
  private changedSince(id: EntityId, since: number | undefined): boolean {
    if (since === undefined)
      return true;
    for (const store of this.addedFilters) {
      if (store.addedTick(id) <= since)
        return false;
    }
    for (const store of this.changedFilters) {
      if (store.changedTick(id) <= since)
        return false;
    }
    return true;
  }

  /**
   * OR the archetype bits of the required stores/components/tags, the excluded
   * components/tags, and each any-of group. Returns `undefined` if any store
   * lacks a bit (not index-registered), so the caller falls back to the scan
   * path. Optional stores are read-only and need no bit.
   */
  private computeMasks(index: ArchetypeIndex): Masks | undefined {
    let required = 0n;
    for (const store of this.stores) {
      const bit = index.bitOf(store);
      if (bit === undefined)
        return undefined;
      required |= bit;
    }
    for (const store of this.requiredComponents) {
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
    for (const store of this.excludedComponents) {
      const bit = index.bitOf(store);
      if (bit === undefined)
        return undefined;
      excluded |= bit;
    }
    const anyOf: bigint[] = [];
    for (const group of this.anyOfGroups) {
      let mask = 0n;
      for (const member of group) {
        const bit = index.bitOf(member);
        if (bit === undefined)
          return undefined;
        mask |= bit;
      }
      anyOf.push(mask);
    }
    return { anyOf, excluded, required };
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

  /**
   * Start a pass's change window: return the previous pass's tick and advance
   * the shared clock, so writes from here on stamp strictly later and are seen
   * next pass. Returns `undefined` when the query has no change filter.
   */
  private openChangeWindow(clock: ChangeClock | undefined): number | undefined {
    if (!clock)
      return undefined;
    const since = this.lastRun;
    this.lastRun = clock.tick;
    clock.tick++;
    return since;
  }

  /**
   * Add an optional yielded column (Bevy `Option<&T>`): its value is appended
   * to every result tuple, and is `undefined` for entities that lack it. Does
   * not affect which entities match.
   */
  optional<O>(store: ComponentStoreLike<O>): Query<[...T, O | undefined]> {
    this.optionalStores.push(store as ComponentStoreLike<unknown>);
    return this as unknown as Query<[...T, O | undefined]>;
  }

  /** Test every non-data filter against an entity (used by the scan path). */
  private passesFilters(id: EntityId): boolean {
    for (const store of this.stores) {
      if (!store.has(id))
        return false;
    }
    for (const store of this.requiredComponents) {
      if (!store.has(id))
        return false;
    }
    for (const tag of this.requiredTags) {
      if (!tag.has(id))
        return false;
    }
    for (const tag of this.excludedTags) {
      if (tag.has(id))
        return false;
    }
    for (const store of this.excludedComponents) {
      if (store.has(id))
        return false;
    }
    for (const group of this.anyOfGroups) {
      let hit = false;
      for (const member of group) {
        if (member.has(id)) {
          hit = true;
          break;
        }
      }
      if (!hit)
        return false;
    }
    return true;
  }

  /**
   * Return the pass's resolution, deriving it on the first pass (or after a
   * filter change) and re-selecting buckets only when the index version moved.
   */
  private resolve(): Resolved {
    let resolved = this.resolved;
    if (!resolved) {
      const masks = this.index ? this.computeMasks(this.index) : undefined;
      resolved = { buckets: [], bucketsVersion: -1, clock: this.resolveClock(), masks };
      this.resolved = resolved;
    }
    const { index } = this;
    const { masks } = resolved;
    if (index && masks && resolved.bucketsVersion !== index.version) {
      resolved.buckets = index.selectBuckets(masks.required, masks.excluded, masks.anyOf);
      resolved.bucketsVersion = index.version;
    }
    return resolved;
  }

  /** The one change clock every added/changed filter shares, or `undefined` without change filters. */
  private resolveClock(): ChangeClock | undefined {
    let clock: ChangeClock | undefined;
    for (const store of [...this.addedFilters, ...this.changedFilters]) {
      clock ??= store.clock;
      if (store.clock !== clock)
        throw new Error('Query: added/changed filters span stores with different change clocks (stores from different worlds).');
    }
    return clock;
  }

  /** Collect all matching results into an array. */
  run(): Array<[EntityId, ...T]> {
    return [...this];
  }

  /**
   * Standalone (no-index) iteration: pick the smallest mandatory source and
   * probe every filter per entity. Falls back to the smallest any-of group's
   * deduplicated union when the query has no mandatory source.
   */
  private* scan(since: number | undefined): Generator<[EntityId, ...T]> {
    const sources: FilterStore[] = [...this.stores, ...this.requiredComponents, ...this.requiredTags];
    if (sources.length > 0) {
      let smallest = sources[0];
      for (const source of sources) {
        if (source.size < smallest.size)
          smallest = source;
      }
      for (const id of idsOf(smallest)) {
        if (this.passesFilters(id) && this.changedSince(id, since))
          yield this.buildResult(id);
      }
      return;
    }

    if (this.anyOfGroups.length === 0)
      return;
    let group = this.anyOfGroups[0];
    let groupSize = group.reduce((sum, m) => sum + m.size, 0);
    for (const candidate of this.anyOfGroups) {
      const size = candidate.reduce((sum, m) => sum + m.size, 0);
      if (size < groupSize) {
        group = candidate;
        groupSize = size;
      }
    }
    const seen = new Set<EntityId>();
    for (const member of group) {
      for (const id of idsOf(member)) {
        if (seen.has(id))
          continue;
        seen.add(id);
        if (this.passesFilters(id) && this.changedSince(id, since))
          yield this.buildResult(id);
      }
    }
  }

  * [Symbol.iterator](): Generator<[EntityId, ...T]> {
    const { buckets, clock, masks } = this.resolve();
    const since = this.openChangeWindow(clock);
    if (this.index && masks) {
      // A query with no positive term (no data/with/tag store and no any-of
      // group) selects nothing — the index tracks only entities holding ≥ 1 bit.
      if (masks.required === 0n && masks.anyOf.length === 0)
        return;
      // Guard the loop: a structural change to a matched store mid-iteration
      // throws in DEV instead of silently skipping a swap-removed entity.
      this.index.beginIteration();
      try {
        for (const bucket of buckets) {
          for (const id of bucket) {
            if (this.changedSince(id, since))
              yield this.buildResult(id);
          }
        }
      }
      finally {
        this.index.endIteration();
      }
      return;
    }

    yield* this.scan(since);
  }

  /** Require the given components without yielding them (Bevy `With<T>`). */
  withComponent(...stores: ComponentFilter[]): this {
    this.resolved = undefined;
    this.requiredComponents.push(...stores);
    return this;
  }

  /** Exclude entities that have any of the given tags. */
  without(...tags: TagStore[]): this {
    this.resolved = undefined;
    this.excludedTags.push(...tags);
    return this;
  }

  /** Exclude entities that have any of the given components (Bevy `Without<T>`). */
  withoutComponent(...stores: ComponentFilter[]): this {
    this.resolved = undefined;
    this.excludedComponents.push(...stores);
    return this;
  }

  /** Require entities to have all given tags. */
  withTag(...tags: TagStore[]): this {
    this.resolved = undefined;
    this.requiredTags.push(...tags);
    return this;
  }
}
