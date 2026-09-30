import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { aabb3VsAabb3 } from '@pierre/ecs/modules/collision-3d';

import { Block } from '../blocks';
import { CooldownDef, Position3DDef, ready, ShapeAabb3DDef, trigger } from '../components';
import { ACTION_COOLDOWN_MS, selectedBlock, setBlock } from '../game';
import { cellBox } from '../voxels';

/**
 * Break (LMB) and place (RMB) the block under the crosshair, at most once per
 * `ACTION_COOLDOWN_MS` while held. `state.target` is the frame's pick; a placed
 * block is refused when it would overlap the player's own box.
 */
export const interactSystem: SchedulableSystem<GameState> = {
  name: 'interact',
  runAfter: ['cooldown', 'movement'],
  run(ctx) {
    if (ctx.playerId == null || !ctx.look.locked || !ctx.target)
      return;
    const cooldown = ctx.world.getStore(CooldownDef).get(ctx.playerId);
    if (!cooldown || !ready(cooldown))
      return;
    const { cell, place } = ctx.target;

    if (ctx.input.isDown('break')) {
      const id = ctx.world.grid.get(cell.x, cell.y, cell.z);
      setBlock(ctx.world, cell.x, cell.y, cell.z, Block.Air);
      ctx.events.emit({ block: id, type: 'BlockBroken' });
      trigger(cooldown, ACTION_COOLDOWN_MS);
      ctx.target = null;
      return;
    }
    if (ctx.input.isDown('place') && ctx.world.grid.inBounds(place.x, place.y, place.z)) {
      const pos = ctx.world.getStore(Position3DDef).get(ctx.playerId);
      const shape = ctx.world.getStore(ShapeAabb3DDef).get(ctx.playerId);
      if (pos && shape) {
        const body = { center: pos, half: { x: shape.w / 2, y: shape.h / 2, z: shape.d / 2 } };
        if (aabb3VsAabb3(body, cellBox(place.x, place.y, place.z)))
          return;
      }
      const id = selectedBlock(ctx);
      setBlock(ctx.world, place.x, place.y, place.z, id);
      ctx.events.emit({ block: id, type: 'BlockPlaced' });
      trigger(cooldown, ACTION_COOLDOWN_MS);
      ctx.target = null;
    }
  },
};
