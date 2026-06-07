import type { TextureAtlasRegistry } from '@pierre/ecs/modules/texture-atlas';
import type { TmxMap } from '@pierre/ecs/modules/tmx';

export const CHAR_ATLAS = 'chars';
/** Atlas key for the tiny-16-basic character sheet. */
export const TINY_CHAR_ATLAS = 'tiny-chars';

/** Columns in `tilemap_packed.png` (16px tiles, no spacing/margin). */
const PACKED_COLS = 12;
const TILE = 16;

/** Source rect of a tile index within the packed character sheet. */
export function charFrame(index: number): { h: number; w: number; x: number; y: number } {
  return {
    h: TILE,
    w: TILE,
    x: (index % PACKED_COLS) * TILE,
    y: Math.floor(index / PACKED_COLS) * TILE,
  };
}

// ── tiny-16-basic characters.png layout ──
// 12 columns × 8 rows of 16×16 tiles. 8 characters arranged 4 wide × 2 tall.
// Each character occupies 3 columns × 4 rows (down, left, right, up).
const TINY_COLS = 12;

/** Register a character's 12 frames from the tiny-16-basic sheet. */
export function addTinyCharAtlas(
  registry: TextureAtlasRegistry,
  image: HTMLImageElement,
  charIndex = 0,
): void {
  const charCol = charIndex % 4;
  const charRow = Math.floor(charIndex / 4);
  const baseCol = charCol * 3;
  const baseRow = charRow * 4;
  const frames: Record<string, { h: number; w: number; x: number; y: number }> = {};
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) {
      const tileIndex = (baseRow + row) * TINY_COLS + (baseCol + col);
      frames[String(tileIndex)] = {
        h: TILE,
        w: TILE,
        x: ((baseCol + col) % TINY_COLS) * TILE,
        y: (baseRow + row) * TILE,
      };
    }
  }
  registry.add(TINY_CHAR_ATLAS, image, frames);
}

/** 3-frame sequence for each cardinal direction (character 0). */
export const TINY_DIRECTION_FRAMES: Record<'down' | 'left' | 'right' | 'up', string[]> = {
  down: ['0', '1', '2'],
  left: ['12', '13', '14'],
  right: ['24', '25', '26'],
  up: ['36', '37', '38'],
};

/** Packed-sheet tile index for the player avatar. */
export const PLAYER_SPRITE = 100;

export interface NpcDialogue {
  name: string;
  /** Ordered dialogue boxes shown one at a time. */
  dialog: string[];
  /** Map GID of the baked character tile this dialogue attaches to. */
  gid: number;
}

// Dialogue is keyed by the GID of a character already painted into the map's
// Objects layer. At startup the map is scanned for these GIDs and an invisible
// interaction point is placed on each match, so NPCs reuse the baked artwork
// instead of spawning duplicate sprites. Lengths vary so the talk flow covers
// single- and multi-box conversations.
export const NPC_DIALOGUES: readonly NpcDialogue[] = [
  {
    name: 'Gareth',
    dialog: ['Halt! The dungeon ahead is no place for the unprepared.'],
    gid: 87,
  },
  {
    name: 'Mara',
    gid: 112,
    dialog: [
      'Wares! Fine wares! Potions, rope, a slightly haunted lantern...',
      'The lantern? Oh, it only screams on Tuesdays. Practically a bargain.',
      'Come back when your pockets jingle, friend.',
    ],
  },
  {
    name: 'Old Pip',
    gid: 88,
    dialog: [
      'These old stones remember more than I do.',
      'Watch the carts — they roll where the floor dips. Mind your toes.',
    ],
  },
  {
    name: 'Brother Edwin',
    gid: 98,
    dialog: [
      'Light a candle for those who never found the way out.',
      'The deeper halls test faith more than steel.',
    ],
  },
  {
    name: 'Sera',
    dialog: ['Lost, are you? Keep to the lit stones and you might stay that way.'],
    gid: 85,
  },
  {
    name: 'Tobin',
    dialog: ['Keep your blade up and your wits sharper — down here, both rust.'],
    gid: 110,
  },
];

export interface NpcPlacement {
  name: string;
  dialog: string[];
  /** Tile coordinates of the baked character this NPC attaches to. */
  tileX: number;
  tileY: number;
}

/**
 * Scans every layer for the dialogue GIDs and returns one interaction point per
 * matching tile, so NPC positions track the artwork already in the map.
 */
export function findNpcPlacements(
  map: TmxMap,
  dialogues: readonly NpcDialogue[],
): NpcPlacement[] {
  const byGid = new Map(dialogues.map(d => [d.gid, d]));
  const placements: NpcPlacement[] = [];
  for (const layer of map.layers) {
    for (let i = 0; i < layer.gids.length; i++) {
      const dialogue = byGid.get(layer.gids[i]!);
      if (!dialogue)
        continue;
      placements.push({
        name: dialogue.name,
        dialog: dialogue.dialog,
        tileX: i % layer.width,
        tileY: Math.floor(i / layer.width),
      });
    }
  }
  return placements;
}

/** Adds the character atlas (just the player avatar) to a registry. */
export function addCharAtlas(
  registry: TextureAtlasRegistry,
  image: HTMLImageElement,
): void {
  registry.add(CHAR_ATLAS, image, { [PLAYER_SPRITE]: charFrame(PLAYER_SPRITE) });
}
