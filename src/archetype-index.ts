import type { EntityId } from '#entity-id';

/**
 * Incremental archetype index behind {@link query!QueryBuilder}. Groups
 * entities by their exact component/tag set (an **archetype**) so a query
 * selects whole buckets by signature instead of probing every store per
 * entity.
 *
 * A **signature** is a `bigint` bitmask: each registered component store and
 * tag store owns one bit ({@link registerStore}), and an entity's signature is
 * the OR of the bits it currently holds. `bigint` (not a 32-bit number) lifts
 * any cap on how many component/tag types a world may register.
 *
 * The index is engine-internal — the world maintains it from the store
 * `set`/`delete`/`add` events it already listens to. It is deliberately not
 * exported from the package barrel.
 */
export class ArchetypeIndex {
  private readonly bits = new Map<object, bigint>();
  private readonly buckets = new Map<bigint, Set<EntityId>>();
  private iterationDepth = 0;
  private readonly matchCache = new Map<string, { buckets: Set<EntityId>[]; version: number }>();
  private nextBit = 1n;
  private readonly signatures = new Map<EntityId, bigint>();
  private structuralVersion = 0;

  /** Set `bit` on `id`'s signature. Idempotent, so a value replace never moves buckets. */
  addBit(id: EntityId, bit: bigint): void {
    const prev = this.signatures.get(id) ?? 0n;
    const next = prev | bit;
    if (next !== prev)
      this.moveEntity(id, prev, next);
  }

  /**
   * Mark the start of a query iteration. While `iterationDepth > 0`, a
   * structural change (a bucket move or entity removal) throws in DEV — the
   * guard that turns "mutating a store during its own query loop" from a silent
   * skip into a loud failure. Balanced by {@link endIteration}.
   */
  beginIteration(): void {
    this.iterationDepth++;
  }

  /** The bit owned by a registered store, or `undefined` if it was never registered. */
  bitOf(store: object): bigint | undefined {
    return this.bits.get(store);
  }

  /** Drop all entities and buckets, keeping store→bit assignments (mirrors `world.clearAll`). */
  clear(): void {
    this.signatures.clear();
    this.buckets.clear();
    this.matchCache.clear();
    this.structuralVersion++;
  }

  /** Balance a {@link beginIteration} call. */
  endIteration(): void {
    this.iterationDepth--;
  }

  /**
   * Yield every entity whose signature is a superset of `required`, disjoint
   * from `excluded`, and intersects **every** mask in `anyOf` (each mask being
   * one OR-group — the entity must hold at least one member of each group).
   */
  * matching(required: bigint, excluded: bigint, anyOf: readonly bigint[] = []): Generator<EntityId> {
    for (const bucket of this.selectBuckets(required, excluded, anyOf)) {
      yield* bucket;
    }
  }

  private moveEntity(id: EntityId, prev: bigint, next: bigint): void {
    if (import.meta.env.DEV && this.iterationDepth > 0)
      throw new Error('Structural change during query iteration — defer it with world.queueAdd / queueRemove / queueSpawn / queueDestroy and flush after the loop.');
    if (prev !== 0n)
      this.removeFromBucket(prev, id);
    if (next === 0n) {
      this.signatures.delete(id);
      return;
    }
    this.signatures.set(id, next);
    let bucket = this.buckets.get(next);
    if (!bucket) {
      bucket = new Set();
      this.buckets.set(next, bucket);
      this.structuralVersion++;
    }
    bucket.add(id);
  }

  /** Assign (or return the existing) bit for a component/tag store instance. */
  registerStore(store: object): bigint {
    let bit = this.bits.get(store);
    if (bit === undefined) {
      bit = this.nextBit;
      this.nextBit <<= 1n;
      this.bits.set(store, bit);
    }
    return bit;
  }

  /** Clear `bit` from `id`'s signature. No-op if the bit was not set. */
  removeBit(id: EntityId, bit: bigint): void {
    const prev = this.signatures.get(id);
    if (prev === undefined)
      return;
    const next = prev & ~bit;
    if (next !== prev)
      this.moveEntity(id, prev, next);
  }

  /** Forget an entity entirely (its store rows are gone). */
  removeEntity(id: EntityId): void {
    const prev = this.signatures.get(id);
    if (prev === undefined)
      return;
    if (import.meta.env.DEV && this.iterationDepth > 0)
      throw new Error('Structural change during query iteration — defer it with world.queueAdd / queueRemove / queueSpawn / queueDestroy and flush after the loop.');
    this.signatures.delete(id);
    this.removeFromBucket(prev, id);
  }

  private removeFromBucket(sig: bigint, id: EntityId): void {
    const bucket = this.buckets.get(sig);
    if (!bucket)
      return;
    bucket.delete(id);
    if (bucket.size === 0) {
      this.buckets.delete(sig);
      this.structuralVersion++;
    }
  }

  private selectBuckets(required: bigint, excluded: bigint, anyOf: readonly bigint[]): Set<EntityId>[] {
    const key = `${required}:${excluded}:${anyOf.join(',')}`;
    const cached = this.matchCache.get(key);
    if (cached && cached.version === this.structuralVersion)
      return cached.buckets;
    const result: Set<EntityId>[] = [];
    for (const [sig, bucket] of this.buckets) {
      if ((sig & required) !== required || (sig & excluded) !== 0n)
        continue;
      let ok = true;
      for (const group of anyOf) {
        if ((sig & group) === 0n) {
          ok = false;
          break;
        }
      }
      if (ok)
        result.push(bucket);
    }
    this.matchCache.set(key, { buckets: result, version: this.structuralVersion });
    return result;
  }
}
