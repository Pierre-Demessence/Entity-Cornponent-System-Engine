import type { EntityId } from '#entity-id';

/**
 * Incremental archetype index behind {@link query!Query}. Groups
 * entities by their exact component/tag set (an **archetype**) so a query
 * selects whole buckets by signature instead of probing every store per
 * entity.
 *
 * A **signature** is a `bigint` bitmask: each registered component store and
 * tag store owns one bit ({@link registerStore}), and an entity's signature is
 * the OR of the bits it currently holds. `bigint` (not a 32-bit number) lifts
 * any cap on how many component/tag types a world may register.
 *
 * Bit changes update an entity's signature at once but its bucket placement
 * lazily: the first read of bucket state ({@link version}, {@link selectBuckets},
 * {@link matching}) commits every pending entity with at most one bucket move.
 * Giving an entity N components, or destroying one that holds N, is therefore
 * one move, not N, and no bucket is created for an intermediate signature.
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
  /**
   * Entities touched since the last {@link commit}, mapped to the signature of
   * the bucket that currently contains them (`0n` = in no bucket). An entity
   * absent here sits in the bucket of its `signatures` entry.
   */
  private readonly placed = new Map<EntityId, bigint>();
  /** Each live entity's current signature — what it holds now, not necessarily where its bucket placement is. */
  private readonly signatures = new Map<EntityId, bigint>();
  /** Registered stores by bit position: `stores[i]` owns bit `storeBits[i]` (`1n << i`). */
  private readonly storeBits: bigint[] = [];
  private readonly stores: object[] = [];
  private structuralVersion = 0;

  /** Set `bit` on `id`'s signature. Idempotent, so a value replace never moves buckets. */
  addBit(id: EntityId, bit: bigint): void {
    const prev = this.signatures.get(id) ?? 0n;
    const next = prev | bit;
    if (next !== prev)
      this.setSignature(id, prev, next);
  }

  private assertNotIterating(): void {
    if (import.meta.env.DEV && this.iterationDepth > 0)
      throw new Error('Structural change during query iteration — defer it with world.queueAdd / queueRemove / queueSpawn / queueDestroy and flush after the loop.');
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
    this.placed.clear();
    this.buckets.clear();
    this.matchCache.clear();
    this.structuralVersion++;
  }

  /**
   * Place every entity touched since the last commit in the bucket of its
   * current signature, with at most one move each. No iteration guard here: it
   * fires when the change is made, and pending changes are always committed
   * before a query starts iterating.
   */
  private commit(): void {
    if (this.placed.size === 0)
      return;
    for (const [id, from] of this.placed) {
      const to = this.signatures.get(id) ?? 0n;
      if (from === to)
        continue;
      if (from !== 0n)
        this.removeFromBucket(from, id);
      if (to !== 0n) {
        let bucket = this.buckets.get(to);
        if (!bucket) {
          bucket = new Set();
          this.buckets.set(to, bucket);
          this.structuralVersion++;
        }
        bucket.add(id);
      }
    }
    this.placed.clear();
  }

  /** Balance a {@link beginIteration} call. */
  endIteration(): void {
    this.iterationDepth--;
  }

  /**
   * Call `fn` with each store `id` currently holds, in registration order. The
   * signature is read up front, so `fn` may remove rows (and bits) as it goes.
   */
  forEachStoreOf(id: EntityId, fn: (store: object) => void): void {
    let remaining = this.signatures.get(id) ?? 0n;
    for (let i = 0; remaining !== 0n; i++) {
      const bit = this.storeBits[i]!;
      if ((remaining & bit) !== 0n) {
        remaining &= ~bit;
        fn(this.stores[i]!);
      }
    }
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

  /** Assign (or return the existing) bit for a component/tag store instance. */
  registerStore(store: object): bigint {
    let bit = this.bits.get(store);
    if (bit === undefined) {
      bit = this.nextBit;
      this.nextBit <<= 1n;
      this.bits.set(store, bit);
      this.stores.push(store);
      this.storeBits.push(bit);
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
      this.setSignature(id, prev, next);
  }

  /** Forget an entity entirely (its store rows are gone). */
  removeEntity(id: EntityId): void {
    const current = this.signatures.get(id);
    if (current === undefined)
      return;
    this.assertNotIterating();
    const from = this.placed.get(id) ?? current;
    this.signatures.delete(id);
    this.placed.delete(id);
    if (from !== 0n)
      this.removeFromBucket(from, id);
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

  /**
   * The buckets {@link matching} walks, as a reusable list. The list stays valid
   * until {@link version} changes; a caller holding it may keep iterating it
   * across passes without re-selecting.
   */
  selectBuckets(required: bigint, excluded: bigint, anyOf: readonly bigint[] = []): readonly Set<EntityId>[] {
    this.commit();
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

  /** Record the bucket `id` currently sits in (first change only), then update its signature. */
  private setSignature(id: EntityId, prev: bigint, next: bigint): void {
    this.assertNotIterating();
    if (!this.placed.has(id))
      this.placed.set(id, prev);
    if (next === 0n)
      this.signatures.delete(id);
    else
      this.signatures.set(id, next);
  }

  /**
   * Structural version: bumps whenever a bucket is created or emptied, or the
   * index is cleared. Reading it first commits every pending placement, so it
   * always reflects the structural changes made so far.
   */
  get version(): number {
    this.commit();
    return this.structuralVersion;
  }
}
