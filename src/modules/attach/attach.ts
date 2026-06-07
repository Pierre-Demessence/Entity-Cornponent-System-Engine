import type { ComponentDef, EcsWorld, EntityId, SchedulableSystem } from '#index';

import { simpleComponent } from '#index';

import { PositionDef, RotationDef, VelocityDef } from '../transform';

/** Component data: which entity to follow and how. */
export interface Attach {
  /** Add the parent's velocity × dt to this entity's position each tick. */
  inheritVelocity?: boolean;
  /** The entity this one is attached to. */
  parent: EntityId;
  /** Snap this entity's position to the parent's position each tick. */
  snapPosition?: boolean;
  /** Snap this entity's rotation to the parent's rotation each tick. */
  snapRotation?: boolean;
}

export const AttachDef: ComponentDef<Attach> = simpleComponent<Attach>('attach', {
  inheritVelocity: 'boolean',
  parent: 'number',
  snapPosition: 'boolean',
  snapRotation: 'boolean',
});

/** Minimal tick context required by the attach system. */
export interface AttachTickCtx {
  dtMs: number;
  world: EcsWorld;
}

export interface AttachSystemOptions {
  /** Custom system name. Defaults to `'attach'`. */
  name?: string;
  /** Dependencies — should run after movement so parents have final position. */
  runAfter?: string[];
}

/**
 * Build a system that syncs attached entities to their parents each tick.
 *
 * For each entity carrying {@link AttachDef}:
 * - `inheritVelocity` — adds `parent.velocity × dt` to the child's position.
 * - `snapPosition` — sets the child's position to the parent's.
 * - `snapRotation` — sets the child's rotation to the parent's.
 *
 * Runs after movement so parents have settled into their final position.
 */
export function makeAttachSystem<TCtx extends AttachTickCtx>(
  options: AttachSystemOptions = {},
): SchedulableSystem<TCtx> {
  const { name = 'attach', runAfter } = options;

  return {
    name,
    runAfter,
    run(ctx) {
      const dtS = ctx.dtMs / 1000;
      const posStore = ctx.world.getStore(PositionDef);
      const velStore = ctx.world.getStore(VelocityDef);
      const rotStore = ctx.world.getStore(RotationDef);
      const attachStore = ctx.world.getStore(AttachDef);

      for (const [childId, attach] of attachStore) {
        const parentPos = posStore.get(attach.parent);
        if (!parentPos)
          continue;

        const childPos = posStore.get(childId);
        if (!childPos)
          continue;

        if (attach.inheritVelocity) {
          const parentVel = velStore.get(attach.parent);
          if (parentVel) {
            childPos.x += parentVel.vx * dtS;
            childPos.y += parentVel.vy * dtS;
          }
        }

        if (attach.snapPosition) {
          childPos.x = parentPos.x;
          childPos.y = parentPos.y;
        }

        if (attach.snapRotation) {
          const childRot = rotStore.get(childId);
          const parentRot = rotStore.get(attach.parent);
          if (childRot && parentRot) {
            childRot.angle = parentRot.angle;
          }
        }
      }
    },
  };
}
