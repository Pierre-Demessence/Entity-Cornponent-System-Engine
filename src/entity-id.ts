declare const entityIdBrand: unique symbol;

/**
 * Handle to an entity within the ECS world: a slot index packed with a
 * generation counter. Destroyed entities' slots are reused with a bumped
 * generation, so a stale handle never resolves to the slot's new occupant.
 * Read the parts with {@link entityIndex} and {@link entityGeneration}.
 *
 * Branded: a plain `number` is not an `EntityId`. Ids come from the world
 * (`createEntity`, `spawn`, queries, lifecycle events) or from
 * {@link packEntityId}; an `EntityId` still reads as a number anywhere.
 */
export type EntityId = number & { readonly [entityIdBrand]: true };

/** Bits of an {@link EntityId} holding the slot index. */
export const ENTITY_INDEX_BITS = 22;
/** Largest slot index, bounding how many entities can be alive at once. */
export const ENTITY_INDEX_MAX = (1 << ENTITY_INDEX_BITS) - 1;
/** Largest generation; a slot that reaches it is never reused. */
export const ENTITY_GENERATION_MAX = 255;

const ENTITY_ID_MAX = (ENTITY_GENERATION_MAX << ENTITY_INDEX_BITS) | ENTITY_INDEX_MAX;

/** Slot index of `id`. */
export function entityIndex(id: EntityId): number {
  return id & ENTITY_INDEX_MAX;
}

/** Generation of `id`: how many times its slot was reused before it. */
export function entityGeneration(id: EntityId): number {
  return id >>> ENTITY_INDEX_BITS;
}

/** Build an {@link EntityId} from its parts. Throws `RangeError` when either is out of range. */
export function packEntityId(index: number, generation: number): EntityId {
  if (!Number.isInteger(index) || index < 0 || index > ENTITY_INDEX_MAX)
    throw new RangeError(`Entity index ${index} out of range [0, ${ENTITY_INDEX_MAX}]`);
  if (!Number.isInteger(generation) || generation < 0 || generation > ENTITY_GENERATION_MAX)
    throw new RangeError(`Entity generation ${generation} out of range [0, ${ENTITY_GENERATION_MAX}]`);
  return ((generation << ENTITY_INDEX_BITS) | index) as EntityId;
}

/** Whether `value` is a well-formed {@link EntityId} (not whether any world holds it). */
export function isEntityId(value: unknown): value is EntityId {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= ENTITY_ID_MAX;
}

/** Readable form of `id` for logs and debugging, e.g. `5v1` (index 5, generation 1). */
export function formatEntityId(id: EntityId): string {
  return `${entityIndex(id)}v${entityGeneration(id)}`;
}
