import type { TagDef, TagStore } from '#component-store';
import type { EntityId } from '#entity-id';
import type { EcsWorld } from '#world';

/**
 * Tag defs the cycler reads & writes. `controlled` is the "whose turn is it"
 * population; `activeTurn` marks the current actor; `cameraTarget` is
 * optional — only provided when the game has a roaming camera to follow
 * the active entity.
 */
export interface TurnCyclerTags {
  readonly activeTurn: TagDef;
  readonly cameraTarget?: TagDef;
  readonly controlled: TagDef;
}

/**
 * Round-robin active-turn cycler for turn-based games. Parameterized by
 * the `controlled` tag (which entities take turns) and the `activeTurn`
 * tag (which one currently holds the turn). Optional `cameraTarget` is
 * moved in lockstep with `activeTurn` when provided.
 *
 * This is an **opt-in turn-based module**, not a core ECS primitive —
 * real-time games don't use it. Exported via the `@pierre/ecs/modules/turn-based`
 * subpath so consumers only pay for it when they import it.
 */
export class TurnCycler {
  private readonly activeTurnStore: TagStore;
  private readonly cameraTargetStore: TagStore | undefined;
  private readonly controlledStore: TagStore;

  constructor(world: EcsWorld, tags: TurnCyclerTags) {
    this.controlledStore = world.getTag(tags.controlled);
    this.activeTurnStore = world.getTag(tags.activeTurn);
    this.cameraTargetStore = tags.cameraTarget
      ? world.getTag(tags.cameraTarget)
      : undefined;
  }

  /** EntityId currently holding the active-turn tag, or `undefined` if none. */
  get activeEntityId(): EntityId | undefined {
    const [first] = this.activeTurnStore;
    return first;
  }

  /**
   * Advance the active-turn tag to the next controlled entity in
   * insertion order. Also moves `cameraTarget` in lockstep when
   * configured. Returns `true` when the round wrapped (i.e. AI turn
   * should run next), `false` otherwise. A no-op returning `true` when
   * there are 0 or 1 controlled entities.
   */
  advance(): boolean {
    const controlled = [...this.controlledStore];
    if (controlled.length <= 1)
      return true;

    const current = this.activeEntityId;
    if (current === undefined)
      return true;
    const idx = controlled.indexOf(current);
    if (idx === -1)
      return true;
    const nextIdx = (idx + 1) % controlled.length;

    this.activeTurnStore.delete(current);
    this.cameraTargetStore?.delete(current);

    const next = controlled[nextIdx]!;
    this.activeTurnStore.add(next);
    this.cameraTargetStore?.add(next);

    return nextIdx === 0;
  }

  /**
   * True if the active-turn tag is back on the first controlled entity
   * (i.e. every controlled entity has had its turn this round). Returns
   * `true` trivially when there are 0 or 1 controlled entities.
   */
  get allControlledEntitiesActed(): boolean {
    const controlled = [...this.controlledStore];
    if (controlled.length <= 1)
      return true;
    return controlled[0] === this.activeEntityId;
  }
}
