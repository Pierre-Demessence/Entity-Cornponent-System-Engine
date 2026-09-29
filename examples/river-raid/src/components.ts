import type { ComponentDef, TagDef } from '@pierre/ecs';

import { simpleComponent } from '@pierre/ecs';

/** Axis-aligned size, anchored at the entity's top-left `PositionDef`. */
export { type ShapeAabb, ShapeAabbDef } from '@pierre/ecs/modules/collision';
export {
  type Position,
  PositionDef,
  type Velocity,
  VelocityDef,
} from '@pierre/ecs/modules/transform';

/** Enemy types that appear on the river. */
export type EnemyKind = 'boat' | 'helicopter' | 'jet';

export interface Enemy {
  dir: -1 | 1;
  kind: EnemyKind;
  points: number;
  speed: number;
}

export const EnemyDef: ComponentDef<Enemy> = simpleComponent<Enemy>('enemy', {
  dir: 'number',
  kind: 'string',
  points: 'number',
  speed: 'number',
});

export interface Bridge {
  hp: number;
}

export const BridgeDef: ComponentDef<Bridge> = simpleComponent<Bridge>('bridge', {
  hp: 'number',
});

export interface FuelDepot {
  fuel: number;
}

export const FuelDepotDef: ComponentDef<FuelDepot> = simpleComponent<FuelDepot>('fuelDepot', {
  fuel: 'number',
});

/** Marks a river bank segment. Left/right determined by Position.x relative to centre. */
export interface RiverBank {
  side: 'left' | 'right';
}

export const RiverBankDef: ComponentDef<RiverBank> = simpleComponent<RiverBank>('riverBank', {
  side: 'string',
});

export interface Bullet {
  damage: number;
}

export const BulletDef: ComponentDef<Bullet> = simpleComponent<Bullet>('bullet', {
  damage: 'number',
});

export const PlayerTag: TagDef = { name: 'player' };
export const BulletTag: TagDef = { name: 'bullet' };
export const EnemyTag: TagDef = { name: 'enemy' };
export const FuelDepotTag: TagDef = { name: 'fuelDepot' };
export const BridgeTag: TagDef = { name: 'bridge' };
export const BankTag: TagDef = { name: 'bank' };
