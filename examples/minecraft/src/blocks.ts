/** Block ids as stored in the voxel grid. `0` is air. */
export const Block = {
  Air: 0,
  Dirt: 2,
  Grass: 1,
  Leaves: 6,
  Planks: 7,
  Sand: 4,
  Stone: 3,
  Wood: 5,
} as const;

export type BlockId = (typeof Block)[keyof typeof Block];

/** Base colour (hex) per block id; the mesher shades it per face. */
export const BLOCK_COLOR: Record<number, number> = {
  [Block.Dirt]: 0x86603D,
  [Block.Grass]: 0x5DA13E,
  [Block.Leaves]: 0x3C7A2E,
  [Block.Planks]: 0xB58A52,
  [Block.Sand]: 0xD9C98A,
  [Block.Stone]: 0x7D8086,
  [Block.Wood]: 0x6B4A2B,
};

export const BLOCK_NAME: Record<number, string> = {
  [Block.Dirt]: 'Dirt',
  [Block.Grass]: 'Grass',
  [Block.Leaves]: 'Leaves',
  [Block.Planks]: 'Planks',
  [Block.Sand]: 'Sand',
  [Block.Stone]: 'Stone',
  [Block.Wood]: 'Wood',
};

/** What the hotbar offers, in key order 1..5. */
export const HOTBAR: readonly BlockId[] = [Block.Grass, Block.Dirt, Block.Stone, Block.Planks, Block.Sand];

export function isSolid(id: number): boolean {
  return id !== Block.Air;
}
