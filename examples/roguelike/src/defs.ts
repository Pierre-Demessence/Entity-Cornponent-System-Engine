import type { EntityTemplate, TagDef } from '@pierre/ecs';

import { composeTemplates, EcsWorld, simpleComponent } from '@pierre/ecs';
import { CameraDef } from '@pierre/ecs/modules/camera';
import {
  OpacityDef,
  RenderableDef,
  RenderOrderDef,
  ScreenSpaceDef,
} from '@pierre/ecs/modules/render-canvas2d';
import { PositionDef } from '@pierre/ecs/modules/transform';

/** Atlas key for Kenney's tiny-dungeon `tilemap_packed.png`. */
export const ATLAS = 'dungeon';
export const TILE = 16;

// ── Components ───────────────────────────────────────────────────────────────
// `PositionDef` is the pixel position the renderer draws; `GridPosDef` is the
// cell the rules reason about. Movement sets the cell at once and slides the
// pixel position after it.

export interface GridPos { x: number; y: number }
export const GridPosDef = simpleComponent<GridPos>('gridPos', { x: 'i32', y: 'i32' });

export interface Fighter { atk: number; hp: number; maxHp: number }
export const FighterDef = simpleComponent<Fighter>('fighter', { atk: 'i32', hp: 'i32', maxHp: 'i32' });

export type AiKind = 'archer' | 'melee';
export interface Ai {
  /** Set once the monster has seen the player; it then chases the last seen cell. */
  hunting: boolean;
  kind: AiKind;
  lastSeenX: number;
  lastSeenY: number;
  /** Ranged attack reach in cells (archers only). */
  range: number;
}
export const AiDef = simpleComponent<Ai>('ai', {
  hunting: 'boolean',
  kind: 'string',
  lastSeenX: 'i32',
  lastSeenY: 'i32',
  range: 'i32',
});

export interface Label { name: string }
export const LabelDef = simpleComponent<Label>('label', { name: 'string' });

export interface Inventory { potions: number }
export const InventoryDef = simpleComponent<Inventory>('inventory', { potions: 'i32' });

/** A floor pickup; `heal` is how much HP a potion restores. */
export interface Item { heal: number }
export const ItemDef = simpleComponent<Item>('item', { heal: 'i32' });

// ── Tags ─────────────────────────────────────────────────────────────────────

export const PlayerTag: TagDef = { name: 'player' };
export const MonsterTag: TagDef = { name: 'monster' };
/** Everything that takes turns — the `TurnCycler`'s `controlled` population. */
export const ActorTag: TagDef = { name: 'actor' };
export const ActiveTurnTag: TagDef = { name: 'activeTurn' };
export const StairsTag: TagDef = { name: 'stairs' };
export const HudTag: TagDef = { name: 'hud' };
export const EliteTag: TagDef = { name: 'elite' };
// Not 'camera' — a tag sharing CameraDef's component name collides on save/load.
export const CameraTag: TagDef = { name: 'cameraEntity' };

export function makeWorld(): EcsWorld {
  const world = new EcsWorld();
  for (const def of [
    PositionDef,
    RenderableDef,
    RenderOrderDef,
    OpacityDef,
    ScreenSpaceDef,
    CameraDef,
    GridPosDef,
    FighterDef,
    AiDef,
    LabelDef,
    InventoryDef,
    ItemDef,
  ]) {
    world.registerComponent(def as Parameters<EcsWorld['registerComponent']>[0]);
  }
  for (const tag of [PlayerTag, MonsterTag, ActorTag, ActiveTurnTag, StairsTag, HudTag, EliteTag, CameraTag])
    world.registerTag(tag);
  return world;
}

// ── Templates ────────────────────────────────────────────────────────────────
// Monsters are layered data: a base creature, a race (sprite + stats), an
// archetype (how it fights), and optionally an elite variant on top.

export function sprite(frame: number): { anchor: 'center'; atlas: string; frame: string; kind: 'sprite' } {
  return { anchor: 'center', atlas: ATLAS, frame: String(frame), kind: 'sprite' };
}

const baseCreature: EntityTemplate = {
  name: 'creature',
  tags: [MonsterTag.name, ActorTag.name],
  components: {
    opacity: { value: 1 },
    renderOrder: { value: 10 },
  },
};

const rat: EntityTemplate = {
  name: 'rat',
  components: {
    fighter: { atk: 1, hp: 3, maxHp: 3 },
    label: { name: 'rat' },
    renderable: sprite(124),
  },
};
const goblin: EntityTemplate = {
  name: 'goblin',
  components: {
    fighter: { atk: 2, hp: 6, maxHp: 6 },
    label: { name: 'goblin' },
    renderable: sprite(109),
  },
};
const cultist: EntityTemplate = {
  name: 'cultist',
  components: {
    fighter: { atk: 2, hp: 4, maxHp: 4 },
    label: { name: 'cultist' },
    renderable: sprite(111),
  },
};

const melee: EntityTemplate = {
  name: 'melee',
  components: { ai: { hunting: false, kind: 'melee', lastSeenX: 0, lastSeenY: 0, range: 1 } },
};
const archer: EntityTemplate = {
  name: 'archer',
  components: { ai: { hunting: false, kind: 'archer', lastSeenX: 0, lastSeenY: 0, range: 5 } },
};

export const MONSTERS = {
  cultistArcher: composeTemplates(baseCreature, cultist, archer, { name: 'cultistArcher' }),
  goblin: composeTemplates(baseCreature, goblin, melee, { name: 'goblin' }),
  goblinArcher: composeTemplates(baseCreature, goblin, archer, { name: 'goblinArcher' }),
  rat: composeTemplates(baseCreature, rat, melee, { name: 'rat' }),
  // Components merge shallowly, so the elite restates the whole `fighter`.
  goblinChief: composeTemplates(baseCreature, goblin, melee, {
    name: 'goblinChief',
    tags: [EliteTag.name],
    components: {
      fighter: { atk: 4, hp: 14, maxHp: 14 },
      label: { name: 'goblin chief' },
      renderable: sprite(110),
    },
  }),
} satisfies Record<string, EntityTemplate>;

export const POTION: EntityTemplate = {
  name: 'potion',
  components: {
    item: { heal: 6 },
    label: { name: 'potion' },
    opacity: { value: 1 },
    renderable: sprite(115),
    renderOrder: { value: 5 },
  },
};

export const STAIRS: EntityTemplate = {
  name: 'stairs',
  tags: [StairsTag.name],
  components: {
    opacity: { value: 1 },
    renderable: sprite(41),
    renderOrder: { value: 1 },
  },
};

export function cellCenter(cell: number): number {
  return cell * TILE + TILE / 2;
}
