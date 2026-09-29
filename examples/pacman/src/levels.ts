/** Classic full speed, in tiles per second; every actor speed is a fraction of it. */
export const BASE_SPEED = 9.47;

export interface LevelParams {
  /** Frightened time in ms; `0` means the ghosts only reverse. */
  frightMs: number;
  /** Ghosts' speed while frightened. */
  ghostFright: number;
  ghostSpeed: number;
  ghostTunnel: number;
  pacFright: number;
  pacSpeed: number;
  /** Alternating scatter / chase durations in ms, starting with scatter; the last is `Infinity`. */
  schedule: readonly number[];
}

const FRIGHT_SECONDS = [6, 5, 4, 3, 2, 5, 2, 2, 1, 5, 2, 1, 1, 3, 1, 1, 0, 1];

function scheduleFor(level: number): readonly number[] {
  if (level === 1)
    return [7000, 20000, 7000, 20000, 5000, 20000, 5000, Infinity];
  if (level <= 4)
    return [7000, 20000, 7000, 20000, 5000, 1033000, 17, Infinity];
  return [5000, 20000, 5000, 20000, 5000, 1037000, 17, Infinity];
}

export function levelParams(level: number): LevelParams {
  const frightMs = (FRIGHT_SECONDS[level - 1] ?? 0) * 1000;
  const schedule = scheduleFor(level);
  if (level === 1)
    return { frightMs, ghostFright: 0.5, ghostSpeed: 0.75, ghostTunnel: 0.4, pacFright: 0.9, pacSpeed: 0.8, schedule };
  if (level <= 4)
    return { frightMs, ghostFright: 0.55, ghostSpeed: 0.85, ghostTunnel: 0.45, pacFright: 0.95, pacSpeed: 0.9, schedule };
  if (level <= 20)
    return { frightMs, ghostFright: 0.6, ghostSpeed: 0.95, ghostTunnel: 0.5, pacFright: 1, pacSpeed: 1, schedule };
  return { frightMs, ghostFright: 0.6, ghostSpeed: 0.95, ghostTunnel: 0.5, pacFright: 1, pacSpeed: 0.9, schedule };
}

export interface Fruit { name: string; points: number }

const FRUITS: readonly Fruit[] = [
  { name: 'cherry', points: 100 },
  { name: 'strawberry', points: 300 },
  { name: 'orange', points: 500 },
  { name: 'apple', points: 700 },
  { name: 'melon', points: 1000 },
];

export function fruitForLevel(level: number): Fruit {
  return FRUITS[Math.min(level, FRUITS.length) - 1]!;
}

export const FRUIT_NAMES: readonly string[] = FRUITS.map(f => f.name);

/** Dots a ghost waits for before leaving the house: `[pinky, inky, clyde]`. */
export function releaseDots(level: number): readonly [number, number, number] {
  if (level === 1)
    return [0, 30, 60];
  if (level === 2)
    return [0, 0, 50];
  return [0, 0, 0];
}

/** Points for the n-th ghost eaten on one power pellet (0-based): 200, 400, 800, 1600. */
export function ghostPoints(nth: number): number {
  return 200 * 2 ** Math.min(nth, 3);
}

export const DOT_POINTS = 10;
export const POWER_POINTS = 50;
export const EXTRA_LIFE_AT = 10000;
