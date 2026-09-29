/**
 * The maze: an ASCII layout plus the tile queries everything else asks of it.
 * Tile `(c, r)` has its centre at world `(c, r)`, so the world unit is one tile
 * and a mover is "on a tile" exactly when both coordinates are integers.
 *
 * `#` wall, `.` dot, `o` power pellet, `-` ghost-house door, space = empty path.
 */
export const MAZE_ROWS: readonly string[] = [
  '############################',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#o####.#####.##.#####.####o#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '#.####.##.########.##.####.#',
  '#.####.##.########.##.####.#',
  '#......##....##....##......#',
  '######.##### ## #####.######',
  '     #.##### ## #####.#     ',
  '     #.##          ##.#     ',
  '     #.## ###--### ##.#     ',
  '######.## #      # ##.######',
  '      .   #      #   .      ',
  '######.## #      # ##.######',
  '     #.## ######## ##.#     ',
  '     #.##          ##.#     ',
  '     #.## ######## ##.#     ',
  '######.## ######## ##.######',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#o..##.......  .......##..o#',
  '###.##.##.########.##.##.###',
  '###.##.##.########.##.##.###',
  '#......##....##....##......#',
  '#.##########.##.##########.#',
  '#.##########.##.##########.#',
  '#..........................#',
  '############################',
];

export const COLS = 28;
export const ROWS = 31;

/** The row whose two open ends wrap around the screen. */
export const TUNNEL_ROW = 14;

export interface Dir { dx: -1 | 0 | 1; dy: -1 | 0 | 1 }

export const UP: Dir = { dx: 0, dy: -1 };
export const LEFT: Dir = { dx: -1, dy: 0 };
export const DOWN: Dir = { dx: 0, dy: 1 };
export const RIGHT: Dir = { dx: 1, dy: 0 };
/** Ghost tie-break priority when two exits are equally close to the target. */
export const DIRS: readonly Dir[] = [UP, LEFT, DOWN, RIGHT];

export function sameDir(a: Dir, b: Dir): boolean {
  return a.dx === b.dx && a.dy === b.dy;
}

export function opposite(d: Dir): Dir {
  return { dx: (d.dx === 0 ? 0 : -d.dx) as Dir['dx'], dy: (d.dy === 0 ? 0 : -d.dy) as Dir['dy'] };
}

export interface Vec { x: number; y: number }

export const PAC_START: Vec = { x: 13.5, y: 23 };
export const HOUSE_CENTER: Vec = { x: 13.5, y: 14 };
/** The path tile just above the door; ghosts leave to it and eyes return to it. */
export const HOUSE_EXIT: Vec = { x: 13.5, y: 11 };
export const FRUIT_SPOT: Vec = { x: 13.5, y: 17 };

/** Tiles where a ghost may not turn upward while roaming. */
const NO_UP_TILES = new Set(['12,11', '15,11', '12,23', '15,23']);

function glyph(c: number, r: number): string {
  return MAZE_ROWS[r]?.[c] ?? ' ';
}

function inBounds(c: number, r: number): boolean {
  return c >= 0 && c < COLS && r >= 0 && r < ROWS;
}

export function isWall(c: number, r: number): boolean {
  if (r === TUNNEL_ROW && (c < 0 || c >= COLS))
    return false;
  return !inBounds(c, r) || glyph(c, r) === '#';
}

export function isDoor(c: number, r: number): boolean {
  return inBounds(c, r) && glyph(c, r) === '-';
}

/** Whether a mover may step onto tile `(c, r)`; only ghosts heading in or out may pass the door. */
export function passable(c: number, r: number, throughDoor = false): boolean {
  if (isDoor(c, r))
    return throughDoor;
  return !isWall(c, r);
}

export function noUpTile(c: number, r: number): boolean {
  return NO_UP_TILES.has(`${c},${r}`);
}

export interface Pellet { c: number; power: boolean; r: number }

/** Every dot and power pellet in the layout, in reading order. */
export function pellets(): Pellet[] {
  const found: Pellet[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const g = glyph(c, r);
      if (g === '.' || g === 'o')
        found.push({ c, power: g === 'o', r });
    }
  }
  return found;
}
