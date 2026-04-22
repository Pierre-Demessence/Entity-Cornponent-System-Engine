export interface PathNode {
  x: number;
  y: number;
}

export interface FindPathOptions {
  from: PathNode;
  /** Abort and return `null` if accumulated `g` exceeds this. Defaults to `Infinity`. */
  maxCost?: number;
  to: PathNode;
  /** Per-edge cost. Defaults to `2` cardinal / `3` diagonal. */
  cost?: (fromX: number, fromY: number, toX: number, toY: number) => number;
  /** Heuristic estimate (admissible for A* optimality). Defaults to Chebyshev using default cost weights. */
  heuristic?: (ax: number, ay: number, bx: number, by: number) => number;
  /** Iterable of neighbor candidates from `(x, y)`. Defaults to 8-directional. */
  neighbors?: (x: number, y: number) => Iterable<PathNode>;
  /** Returns true if the given tile can be stood on / traversed. */
  traversable: (x: number, y: number) => boolean;
}

const DEFAULT_DIRS: readonly PathNode[] = [
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 1 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];

const DEFAULT_CARDINAL = 2;
const DEFAULT_DIAGONAL = 3;

function defaultNeighbors(x: number, y: number): Iterable<PathNode> {
  return DEFAULT_DIRS.map(d => ({ x: x + d.x, y: y + d.y }));
}

function defaultCost(fromX: number, fromY: number, toX: number, toY: number): number {
  const dx = Math.abs(toX - fromX);
  const dy = Math.abs(toY - fromY);
  return dx !== 0 && dy !== 0 ? DEFAULT_DIAGONAL : DEFAULT_CARDINAL;
}

function defaultHeuristic(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  const diag = Math.min(dx, dy);
  const straight = Math.max(dx, dy) - diag;
  return diag * DEFAULT_DIAGONAL + straight * DEFAULT_CARDINAL;
}

function key(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * A* pathfinding on an abstract 2D grid.
 *
 * Returns the ordered waypoints **excluding** the start and
 * **including** the goal, or `null` if unreachable / the goal itself
 * is not traversable. Returns an empty array when `from` equals `to`.
 *
 * The algorithm is grid-agnostic: neighbor generation, edge cost, and
 * traversability are all caller-supplied. Defaults match an
 * 8-directional tile grid with `2` cardinal / `3` diagonal cost (so
 * straight corridors are preferred over diagonal zigzags).
 */
export function findPath(options: FindPathOptions): PathNode[] | null {
  const {
    cost = defaultCost,
    from,
    heuristic = defaultHeuristic,
    maxCost = Infinity,
    neighbors = defaultNeighbors,
    to,
    traversable,
  } = options;

  if (!traversable(to.x, to.y))
    return null;
  if (from.x === to.x && from.y === to.y)
    return [];

  interface OpenNode { f: number; g: number; x: number; y: number }

  const open: OpenNode[] = [];
  const gScore = new Map<string, number>();
  const cameFrom = new Map<string, string>();

  const startKey = key(from.x, from.y);
  gScore.set(startKey, 0);
  open.push({ f: heuristic(from.x, from.y, to.x, to.y), g: 0, x: from.x, y: from.y });

  while (open.length > 0) {
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestIdx].f)
        bestIdx = i;
    }
    const current = open[bestIdx];
    open[bestIdx] = open.at(-1)!;
    open.pop();

    if (current.x === to.x && current.y === to.y) {
      const path: PathNode[] = [];
      let k = key(current.x, current.y);
      while (k !== startKey) {
        const prev = cameFrom.get(k)!;
        const commaIdx = k.indexOf(',');
        path.push({ x: Number(k.slice(0, commaIdx)), y: Number(k.slice(commaIdx + 1)) });
        k = prev;
      }
      path.reverse();
      return path;
    }

    const currentKey = key(current.x, current.y);

    for (const n of neighbors(current.x, current.y)) {
      if (!traversable(n.x, n.y))
        continue;

      const stepCost = cost(current.x, current.y, n.x, n.y);
      const ng = current.g + stepCost;
      if (ng > maxCost)
        continue;

      const nk = key(n.x, n.y);
      const prev = gScore.get(nk);
      if (prev !== undefined && ng >= prev)
        continue;

      gScore.set(nk, ng);
      cameFrom.set(nk, currentKey);
      open.push({ f: ng + heuristic(n.x, n.y, to.x, to.y), g: ng, x: n.x, y: n.y });
    }
  }

  return null;
}
