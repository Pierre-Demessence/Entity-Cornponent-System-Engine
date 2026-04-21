import type { EntityId, SchedulableSystem } from '#index';

/**
 * Options for `makeTriggerSystem`. The system factory accepts a
 * broadphase (which pairs to consider), an optional narrowphase
 * (which pairs actually overlap), and a callback that fires on each
 * confirmed overlap. Pair ordering is whatever the broadphase yields;
 * the system never reorders or de-duplicates.
 *
 * This is intentionally minimal — most of the work lives in the
 * `broadphase` closure, which consumers tailor to their world
 * (spatial index queries, tag iteration, one-vs-many checks, …).
 */
export interface TriggerSystemOptions<TCtx> {
  readonly name?: string;
  readonly phase?: string;
  readonly runAfter?: readonly string[];
  readonly runBefore?: readonly string[];
  /**
   * Broadphase: yields the ordered pairs `[a, b]` to test this tick.
   * Typical patterns: `tagA × tagB`, `sourceId × spatialIndex.queryNear`,
   * or an exhaustive pairwise loop for tiny tag sets.
   *
   * The generator should not emit the same pair twice unless the
   * consumer intentionally wants the callback to fire twice.
   */
  readonly broadphase: (ctx: TCtx) => Iterable<readonly [EntityId, EntityId]>;
  /** Fires once per confirmed overlap. */
  readonly onOverlap: (ctx: TCtx, a: EntityId, b: EntityId) => void;
  /**
   * Narrowphase: returns `true` if the pair actually overlaps. Omit
   * when the broadphase already performs an exact test (e.g. a grid
   * cell lookup that only returns co-located entities).
   */
  readonly overlaps?: (ctx: TCtx, a: EntityId, b: EntityId) => boolean;
}

/**
 * Builds a schedulable system that iterates a broadphase, runs an
 * optional narrowphase filter, and invokes `onOverlap` for each
 * surviving pair. The system is stateless and idempotent within a
 * tick — pair ordering is fully controlled by the broadphase.
 */
export function makeTriggerSystem<TCtx>(
  options: TriggerSystemOptions<TCtx>,
): SchedulableSystem<TCtx> {
  const { name = 'trigger', broadphase, onOverlap, overlaps, phase, runAfter, runBefore } = options;
  const system: SchedulableSystem<TCtx> = {
    name,
    run(ctx) {
      for (const [a, b] of broadphase(ctx)) {
        if (overlaps && !overlaps(ctx, a, b))
          continue;
        onOverlap(ctx, a, b);
      }
    },
  };
  return {
    ...system,
    ...(phase === undefined ? {} : { phase }),
    ...(runAfter === undefined ? {} : { runAfter }),
    ...(runBefore === undefined ? {} : { runBefore }),
  };
}
