import type { EntityId, EntityTemplate, Plugin, TagDef } from '@pierre/ecs';
import type { Renderable } from '@pierre/ecs/modules/render-canvas2d';

import { EcsWorld, simpleComponent } from '@pierre/ecs';
import { easeOutCubic } from '@pierre/ecs/modules/easing';
import { LifetimeDef } from '@pierre/ecs/modules/lifetime';
import { inverseLerp, lerp } from '@pierre/ecs/modules/math';
import { OpacityDef, RenderableDef, RenderOrderDef, ScreenSpaceDef } from '@pierre/ecs/modules/render-canvas2d';
import { HashGrid2D } from '@pierre/ecs/modules/spatial';
import { PositionDef } from '@pierre/ecs/modules/transform';

/** The board is a torus of `BOARD_W × BOARD_H` cells; one cell is one world unit. */
export const BOARD_W = 160;
export const BOARD_H = 100;

/** Generations a cell must survive before its colour stops changing. */
export const AGE_CAP = 16;
/** Generations a ghost lingers where a cell died. */
export const GHOST_GENS = 4;
/** A ghost's opacity when it appears; it fades to zero over `GHOST_GENS`. */
export const GHOST_OPACITY = 0.45;

// ── Components ───────────────────────────────────────────────────────────────
// `PositionDef` is the cell coordinate: the spatial index answers "who is at
// (x, y)" and the renderer draws a 1×1 rect there, scaled by the camera zoom.

/** Generations survived, capped at `AGE_CAP`. */
export interface Age { gens: number }
export const AgeDef = simpleComponent<Age>('age', { gens: 'u8' });

// ── Tags ─────────────────────────────────────────────────────────────────────

/** A live cell. Ghosts and HUD text also carry a position, so the rules filter on this. */
export const CellTag: TagDef = { name: 'cell' };
/** The fading mark a dead cell leaves for a few generations. */
export const GhostTag: TagDef = { name: 'ghost' };
export const HudTag: TagDef = { name: 'hud' };

/** Registers every component and tag the example stores. */
export const lifePlugin: Plugin = {
  name: 'life',
  build(world) {
    world.registerComponent(PositionDef);
    world.registerComponent(RenderableDef);
    world.registerComponent(RenderOrderDef);
    world.registerComponent(OpacityDef);
    world.registerComponent(ScreenSpaceDef);
    world.registerComponent(AgeDef);
    world.registerComponent(LifetimeDef);
    for (const tag of [CellTag, GhostTag, HudTag])
      world.registerTag(tag);
  },
};

// ── Colour ───────────────────────────────────────────────────────────────────

const YOUNG = [255, 244, 170];
const OLD = [40, 120, 230];

/**
 * One shared `Renderable` per age: newborns are pale yellow, old cells settle
 * into blue. Shared objects keep a recolour to a single `set`.
 */
export const AGE_PALETTE: readonly Renderable[] = Array.from({ length: AGE_CAP + 1 }, (_, age) => {
  const t = easeOutCubic(inverseLerp(0, AGE_CAP, age));
  const [r, g, b] = YOUNG.map((c, i) => Math.round(lerp(c, OLD[i]!, t)));
  return { fill: `rgb(${r},${g},${b})`, h: 1, kind: 'rect', w: 1 };
});

export const GHOST_RENDERABLE: Renderable = { fill: 'rgb(170,60,90)', h: 1, kind: 'rect', w: 1 };

// ── Templates ────────────────────────────────────────────────────────────────

// Every component is one archetype move on spawn and on destroy, and the rules
// spawn and destroy thousands of cells a second, so a cell carries only what it
// needs.

export const CELL: EntityTemplate = {
  name: 'cell',
  components: { age: { gens: 0 }, position: { x: 0, y: 0 }, renderable: AGE_PALETTE[0] },
  tags: [CellTag.name],
};

/**
 * The example's world: the plugin's registrations plus a typed handle on the
 * live-cell spatial index, which the rules read for every neighbour count.
 */
export class LifeWorld extends EcsWorld {
  /** Live cells only: ghosts and HUD text share `Position` but lack `CellTag`. */
  readonly grid: HashGrid2D;

  constructor() {
    super();
    this.use(lifePlugin);
    this.grid = this.enableSpatial(PositionDef, new HashGrid2D(), { withTag: CellTag });
  }

  /** The live cell at `(x, y)`, if any. */
  cellAt(x: number, y: number): EntityId | undefined {
    return this.grid.getAt(x, y)?.values().next().value;
  }

  hasCellAt(x: number, y: number): boolean {
    return this.cellAt(x, y) !== undefined;
  }
}
