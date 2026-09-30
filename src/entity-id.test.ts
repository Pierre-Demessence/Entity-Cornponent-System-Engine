import { describe, expect, it } from 'vitest';

import {
  ENTITY_GENERATION_MAX,
  ENTITY_INDEX_BITS,
  ENTITY_INDEX_MAX,
  entityGeneration,
  entityIndex,
  formatEntityId,
  isEntityId,
  packEntityId,
} from '#entity-id';

describe('entity id packing', () => {
  it('generation 0 ids equal their index', () => {
    expect(packEntityId(0, 0)).toBe(0);
    expect(packEntityId(7, 0)).toBe(7);
  });

  it('round-trips index and generation', () => {
    const id = packEntityId(12345, 17);
    expect(entityIndex(id)).toBe(12345);
    expect(entityGeneration(id)).toBe(17);
  });

  it('keeps the largest id non-negative and below 2^30', () => {
    const id = packEntityId(ENTITY_INDEX_MAX, ENTITY_GENERATION_MAX);
    expect(id).toBeGreaterThanOrEqual(0);
    expect(id).toBeLessThan(2 ** 30);
    expect(entityIndex(id)).toBe(ENTITY_INDEX_MAX);
    expect(entityGeneration(id)).toBe(ENTITY_GENERATION_MAX);
  });

  it('exposes a 22-bit index and 8-bit generation', () => {
    expect(ENTITY_INDEX_BITS).toBe(22);
    expect(ENTITY_INDEX_MAX).toBe(2 ** 22 - 1);
    expect(ENTITY_GENERATION_MAX).toBe(255);
  });

  it.each([
    [-1, 0],
    [ENTITY_INDEX_MAX + 1, 0],
    [1.5, 0],
    [0, -1],
    [0, ENTITY_GENERATION_MAX + 1],
    [0, 0.5],
  ])('rejects out-of-range index %s / generation %s', (index, generation) => {
    expect(() => packEntityId(index, generation)).toThrow(RangeError);
  });

  it('isEntityId accepts exactly the packable integers', () => {
    expect(isEntityId(0)).toBe(true);
    expect(isEntityId(packEntityId(ENTITY_INDEX_MAX, ENTITY_GENERATION_MAX))).toBe(true);
    expect(isEntityId(2 ** 30)).toBe(false);
    expect(isEntityId(-1)).toBe(false);
    expect(isEntityId(1.5)).toBe(false);
    expect(isEntityId('3')).toBe(false);
  });

  it('formats as index v generation', () => {
    expect(formatEntityId(packEntityId(5, 1))).toBe('5v1');
  });
});
