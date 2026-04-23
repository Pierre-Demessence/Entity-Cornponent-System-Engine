import type { EntityId } from '#entity-id';
import type { EcsWorld } from '#world';

export type TransitionApplier = () => void;

/**
 * Tick-boundary transition queue. Game code enqueues world swaps during a
 * tick, then applies them between ticks via applyNext().
 */
export class SceneTransitionQueue {
  private readonly pending: TransitionApplier[] = [];

  applyNext(): boolean {
    const next = this.takeNext();
    if (!next) {
      return false;
    }
    next();
    return true;
  }

  clear(): void {
    this.pending.length = 0;
  }

  enqueue(applier: TransitionApplier): void {
    this.pending.push(applier);
  }

  hasPending(): boolean {
    return this.pending.length > 0;
  }

  /** Replace any queued transitions with a single applier (last-write wins). */
  replace(applier: TransitionApplier): void {
    this.pending.length = 0;
    this.pending.push(applier);
  }

  get size(): number {
    return this.pending.length;
  }

  takeNext(): TransitionApplier | null {
    return this.pending.shift() ?? null;
  }
}

/**
 * Transfer a set of entity IDs from one world to another using the world's
 * existing transferEntity semantics.
 */
export function transferEntities(
  to: EcsWorld,
  from: EcsWorld,
  ids: readonly EntityId[],
  componentNames?: readonly string[],
): void {
  for (const id of ids) {
    to.transferEntity(id, from, componentNames);
  }
}
