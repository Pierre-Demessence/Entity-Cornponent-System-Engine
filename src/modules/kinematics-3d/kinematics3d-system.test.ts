import type { EntityId } from '#entity-id';
import type { Aabb3 } from '../collision-3d/narrowphase3';
import type { Kinematics3DSystemOptions, Kinematics3DTickCtx } from './kinematics3d-system';

import { beforeEach, describe, expect, it } from 'vitest';

import { simpleComponent } from '#index';
import { EcsWorld } from '#world';

import { ShapeAabb3Def } from '../collision-3d/shape-aabb3';
import { Grounded3Def } from './grounded';
import { makeKinematics3DSystem } from './kinematics3d-system';

interface Pos3 {
  x: number;
  y: number;
  z: number;
}

interface Vel3 {
  vx: number;
  vy: number;
  vz: number;
}

// The module injects these, so the test declares its own — exactly as a game
// would (there is no `modules/transform-3d` yet).
const Position3DDef = simpleComponent<Pos3>('position3d', { x: 'number', y: 'number', z: 'number' });
const Velocity3DDef = simpleComponent<Vel3>('velocity3d', { vx: 'number', vy: 'number', vz: 'number' });

const StaticBodyTag = { name: 'static-body' };
const DynamicBodyTag = { name: 'dynamic-body' };

interface Ctx extends Kinematics3DTickCtx {
  dtMs: number;
  world: EcsWorld;
}

function setup(): Ctx {
  const world = new EcsWorld();
  world.registerComponent(Position3DDef);
  world.registerComponent(Velocity3DDef);
  world.registerComponent(ShapeAabb3Def);
  world.registerComponent(Grounded3Def);
  world.registerTag(StaticBodyTag);
  world.registerTag(DynamicBodyTag);
  return { dtMs: 1000, world };
}

/** Every dynamic body is a 10×10×10 box (half extents 5). */
function spawnDynamic(
  world: EcsWorld,
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
  grounded = true,
): EntityId {
  const id = world.createEntity();
  world.getStore(Position3DDef).set(id, { x, y, z });
  world.getStore(Velocity3DDef).set(id, { vx, vy, vz });
  world.getStore(ShapeAabb3Def).set(id, { d: 10, h: 10, w: 10 });
  if (grounded)
    world.getStore(Grounded3Def).set(id, { onGround: false });
  world.getTag(DynamicBodyTag).add(id);
  return id;
}

function spawnStatic(
  world: EcsWorld,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
): EntityId {
  const id = world.createEntity();
  world.getStore(Position3DDef).set(id, { x, y, z });
  world.getStore(ShapeAabb3Def).set(id, { d, h, w });
  world.getTag(StaticBodyTag).add(id);
  return id;
}

/** The three consumer copies all brute-force the static tag; so does this. */
function allStatics(world: EcsWorld): (ctx: Ctx, box: Aabb3) => Iterable<EntityId> {
  return () => world.getTag(StaticBodyTag);
}

function makeSystem(
  world: EcsWorld,
  overrides: Partial<Kinematics3DSystemOptions<Ctx>> = {},
) {
  return makeKinematics3DSystem<Ctx>({
    broadphase: allStatics(world),
    dynamicTag: DynamicBodyTag,
    gravity: 0,
    positionDef: Position3DDef,
    staticTag: StaticBodyTag,
    terminalVelocity: 1000,
    velocityDef: Velocity3DDef,
    ...overrides,
  });
}

const pos = (ctx: Ctx, id: EntityId): Pos3 => ctx.world.getStore(Position3DDef).get(id)!;
const vel = (ctx: Ctx, id: EntityId): Vel3 => ctx.world.getStore(Velocity3DDef).get(id)!;
const grounded = (ctx: Ctx, id: EntityId) => ctx.world.getStore(Grounded3Def).get(id)!;

describe('makeKinematics3DSystem options', () => {
  let ctx: Ctx;
  beforeEach(() => {
    ctx = setup();
  });

  it('defaults its name to "kinematics3d"', () => {
    expect(makeSystem(ctx.world).name).toBe('kinematics3d');
  });

  it('propagates name/phase/runAfter/runBefore', () => {
    const sys = makeSystem(ctx.world, {
      name: 'physics',
      phase: 'simulate',
      runAfter: ['input'],
      runBefore: ['render'],
    });
    expect(sys.name).toBe('physics');
    expect(sys.phase).toBe('simulate');
    expect(sys.runAfter).toEqual(['input']);
    expect(sys.runBefore).toEqual(['render']);
  });
});

describe('makeKinematics3DSystem gravity', () => {
  let ctx: Ctx;
  beforeEach(() => {
    ctx = setup();
  });

  it('accelerates downward (-y) and integrates it', () => {
    const sys = makeSystem(ctx.world, { gravity: 1000, terminalVelocity: 100000 });
    const id = spawnDynamic(ctx.world, 0, 0, 0, 0, 0, 0);
    sys.run({ ...ctx, dtMs: 500 });
    expect(vel(ctx, id).vy).toBe(-500);
    expect(pos(ctx, id).y).toBe(-250);
  });

  it('clamps falling speed at terminalVelocity, including velocity already past it', () => {
    const sys = makeSystem(ctx.world, { gravity: 1000, terminalVelocity: 300 });
    const falling = spawnDynamic(ctx.world, 0, 0, 0, 0, 0, 0);
    const knocked = spawnDynamic(ctx.world, 0, 0, 0, 0, -5000, 0);
    sys.run({ ...ctx, dtMs: 500 });
    expect(vel(ctx, falling).vy).toBe(-300);
    expect(vel(ctx, knocked).vy).toBe(-300);
  });

  it('does not clamp upward velocity', () => {
    const sys = makeSystem(ctx.world, { gravity: 0, terminalVelocity: 300 });
    const id = spawnDynamic(ctx.world, 0, 0, 0, 0, 500, 0);
    sys.run({ ...ctx, dtMs: 500 });
    expect(vel(ctx, id).vy).toBe(500);
  });
});

describe('makeKinematics3DSystem axis resolution', () => {
  let ctx: Ctx;
  beforeEach(() => {
    ctx = setup();
  });

  it('lands on a floor, snapping to its top face and reporting onGround', () => {
    const id = spawnDynamic(ctx.world, 0, 0, 0, 0, -45, 0);
    spawnStatic(ctx.world, 0, -50, 0, 100, 20, 100); // top face at y = -40
    makeSystem(ctx.world).run({ ...ctx, dtMs: 1000 });
    expect(pos(ctx, id)).toEqual({ x: 0, y: -35, z: 0 });
    expect(vel(ctx, id).vy).toBe(0);
    expect(grounded(ctx, id).onGround).toBe(true);
  });

  it('stops against a wall on X and zeroes only vx', () => {
    const id = spawnDynamic(ctx.world, 0, 0, 0, 45, 0, 0);
    spawnStatic(ctx.world, 50, 0, 0, 20, 100, 100); // left face at x = 40
    makeSystem(ctx.world).run({ ...ctx, dtMs: 1000 });
    expect(pos(ctx, id).x).toBe(35);
    expect(vel(ctx, id).vx).toBe(0);
    expect(pos(ctx, id).z).toBe(0);
    expect(grounded(ctx, id).onGround).toBe(false);
  });

  it('stops against a wall on Z and zeroes only vz', () => {
    const id = spawnDynamic(ctx.world, 0, 0, 0, 0, 0, 45);
    spawnStatic(ctx.world, 0, 0, 50, 100, 100, 20); // near face at z = 40
    makeSystem(ctx.world).run({ ...ctx, dtMs: 1000 });
    expect(pos(ctx, id).z).toBe(35);
    expect(vel(ctx, id).vz).toBe(0);
    expect(pos(ctx, id).x).toBe(0);
  });

  it('stops against a ceiling without reporting ground contact', () => {
    const id = spawnDynamic(ctx.world, 0, 0, 0, 0, 45, 0);
    spawnStatic(ctx.world, 0, 50, 0, 100, 20, 100); // underside at y = 40
    makeSystem(ctx.world).run({ ...ctx, dtMs: 1000 });
    expect(pos(ctx, id).y).toBe(35);
    expect(vel(ctx, id).vy).toBe(0);
    expect(grounded(ctx, id).onGround).toBe(false);
  });

  it('keeps horizontal velocity when landing (X/Z resolution does not cancel it)', () => {
    const id = spawnDynamic(ctx.world, 0, 0, 0, 45, -45, 0);
    spawnStatic(ctx.world, 0, -50, 0, 100, 20, 100);
    makeSystem(ctx.world).run({ ...ctx, dtMs: 1000 });
    expect(pos(ctx, id).x).toBe(45);
    expect(pos(ctx, id).y).toBe(-35);
    expect(vel(ctx, id).vy).toBe(0);
    expect(vel(ctx, id).vx).toBe(45);
  });

  it('resolves against the tightest of several overlapping statics', () => {
    const id = spawnDynamic(ctx.world, 0, 0, 0, 45, 0, 0);
    spawnStatic(ctx.world, 100, 0, 0, 20, 100, 100);
    spawnStatic(ctx.world, 50, 0, 0, 20, 100, 100);
    makeSystem(ctx.world).run({ ...ctx, dtMs: 1000 });
    expect(pos(ctx, id).x).toBe(35);
  });

  it('never mutates a static body', () => {
    const wall = spawnStatic(ctx.world, 50, 0, 0, 20, 100, 100);
    spawnDynamic(ctx.world, 0, 0, 0, 45, 0, 0);
    makeSystem(ctx.world).run({ ...ctx, dtMs: 1000 });
    expect(pos(ctx, wall)).toEqual({ x: 50, y: 0, z: 0 });
    expect(ctx.world.getStore(ShapeAabb3Def).get(wall)).toEqual({ d: 100, h: 100, w: 20 });
  });
});

describe('makeKinematics3DSystem shallowest-penetration guard', () => {
  let ctx: Ctx;
  beforeEach(() => {
    ctx = setup();
  });

  it('does not let a resting body be blocked (or flung) by the floor it stands on', () => {
    // Feet are one unit inside a floor whose X/Z extent is enormous, so the
    // only shallow axis is Y. Resolving X or Z would move the body 60+ units.
    const id = spawnDynamic(ctx.world, 0, -36, 0, 45, 0, 0);
    spawnStatic(ctx.world, 0, -50, 0, 200, 20, 200);
    makeSystem(ctx.world).run({ ...ctx, dtMs: 1000 });
    expect(pos(ctx, id).x).toBe(45);
    expect(pos(ctx, id).z).toBe(0);
    expect(pos(ctx, id).y).toBe(-35);
    expect(grounded(ctx, id).onGround).toBe(true);
  });

  it('leaves a body embedded in a large block through its shallowest face', () => {
    // 5 units from the +Z face, 55 units from the X faces: only Z may resolve.
    const id = spawnDynamic(ctx.world, 0, 0, 45, 0, 0, 5);
    spawnStatic(ctx.world, 0, 0, 0, 100, 100, 100);
    makeSystem(ctx.world).run({ ...ctx, dtMs: 1000 });
    expect(pos(ctx, id).x).toBe(0);
    expect(pos(ctx, id).z).toBe(55);
    expect(vel(ctx, id).vz).toBe(0);
  });

  it('breaks a tie between two shallowest axes in favour of the earlier one', () => {
    // Equal 5-unit penetrations on X and Y, 15 on Z: X runs first, so X wins —
    // the rule doom's and portal's replaced resolvers had, now pinned down.
    const id = spawnDynamic(ctx.world, 10, 10, 0, 0, 0, 0);
    spawnStatic(ctx.world, 0, 0, 0, 20, 20, 20);
    makeSystem(ctx.world).run({ ...ctx, dtMs: 1000 });
    expect(pos(ctx, id)).toEqual({ x: 15, y: 10, z: 0 });
  });
});

describe('makeKinematics3DSystem step-up', () => {
  let ctx: Ctx;
  beforeEach(() => {
    ctx = setup();
  });

  // A 0.5-tall ledge, entered 0.25 units deep: X is the shallowest axis, so the
  // step is evaluated rather than the body being pushed back out of the wall.
  const ledge = (ctx: Ctx, h = 0.5) => spawnStatic(ctx.world, 50, h / 2, 0, 20, h, 20);
  // `groundState` covers the three bodies step-up distinguishes: grounded last
  // tick, carrying Grounded3 but not grounded, and carrying no Grounded3 at all.
  const walkIn = (ctx: Ctx, groundState: 'false' | 'none' | 'true' = 'true') => {
    const id = spawnDynamic(ctx.world, 0, 5, 0, 35.25, 0, 0, groundState !== 'none');
    if (groundState !== 'none')
      ctx.world.getStore(Grounded3Def).set(id, { onGround: groundState === 'true' });
    return id;
  };

  it('climbs a ledge within stepHeight and keeps moving', () => {
    ledge(ctx);
    const id = walkIn(ctx);
    makeSystem(ctx.world, { stepHeight: 1 }).run({ ...ctx, dtMs: 1000 });
    expect(pos(ctx, id).y).toBe(5.5);
    expect(pos(ctx, id).x).toBe(35.25);
    expect(vel(ctx, id).vx).toBe(35.25);
    expect(grounded(ctx, id).onGround).toBe(true);
  });

  it('is off unless stepHeight is supplied', () => {
    ledge(ctx);
    const id = walkIn(ctx);
    makeSystem(ctx.world).run({ ...ctx, dtMs: 1000 });
    expect(pos(ctx, id).y).toBe(5);
    expect(pos(ctx, id).x).toBe(35);
    expect(vel(ctx, id).vx).toBe(0);
  });

  it('does not climb unless the body was grounded last tick', () => {
    ledge(ctx);
    const id = walkIn(ctx, 'false');
    makeSystem(ctx.world, { stepHeight: 1 }).run({ ...ctx, dtMs: 1000 });
    expect(pos(ctx, id).x).toBe(35);
    expect(pos(ctx, id).y).toBe(5);
  });

  it('never climbs a body that carries no Grounded3', () => {
    ledge(ctx);
    const id = walkIn(ctx, 'none');
    makeSystem(ctx.world, { stepHeight: 1 }).run({ ...ctx, dtMs: 1000 });
    expect(pos(ctx, id).x).toBe(35);
    expect(pos(ctx, id).y).toBe(5);
  });

  it('climbs a ledge on Z as well as X', () => {
    spawnStatic(ctx.world, 0, 0.25, 50, 20, 0.5, 20);
    const id = spawnDynamic(ctx.world, 0, 5, 0, 0, 0, 35.25);
    ctx.world.getStore(Grounded3Def).set(id, { onGround: true });
    makeSystem(ctx.world, { stepHeight: 1 }).run({ ...ctx, dtMs: 1000 });
    expect(pos(ctx, id).y).toBe(5.5);
    expect(pos(ctx, id).z).toBe(35.25);
    expect(vel(ctx, id).vz).toBe(35.25);
  });

  it('resolves a static that only overlaps once the step-up has moved the body', () => {
    // The lintel sits above the body's pre-step top, so it comes into range
    // only after the climb — it has to be tested against the post-climb box.
    const step = spawnStatic(ctx.world, 50, 0.25, 0, 20, 0.5, 20);
    const lintel = spawnStatic(ctx.world, 50.125, 12.25, 0, 20, 4, 20);
    const id = walkIn(ctx);
    makeSystem(ctx.world, { stepHeight: 1, broadphase: () => [step, lintel] })
      .run({ ...ctx, dtMs: 1000 });
    expect(pos(ctx, id).y).toBe(5.5);
    expect(pos(ctx, id).x).toBe(35.125);
    expect(vel(ctx, id).vx).toBe(0);
  });

  it('does not climb a ledge taller than stepHeight', () => {
    ledge(ctx, 2);
    const id = walkIn(ctx);
    makeSystem(ctx.world, { stepHeight: 1 }).run({ ...ctx, dtMs: 1000 });
    expect(pos(ctx, id).x).toBe(35);
    expect(pos(ctx, id).y).toBe(5);
  });
});

describe('makeKinematics3DSystem ground reporting', () => {
  let ctx: Ctx;
  beforeEach(() => {
    ctx = setup();
  });

  it('clears onGround when nothing is under the body', () => {
    const id = spawnDynamic(ctx.world, 0, 0, 0, 0, 0, 0);
    ctx.world.getStore(Grounded3Def).set(id, { onGround: true });
    makeSystem(ctx.world).run({ ...ctx, dtMs: 1000 });
    expect(grounded(ctx, id).onGround).toBe(false);
  });

  it('re-derives onGround every tick, even a zero-length one', () => {
    const id = spawnDynamic(ctx.world, 10, 20, 30, 5, -3, 7);
    ctx.world.getStore(Grounded3Def).set(id, { onGround: true });
    makeSystem(ctx.world).run({ ...ctx, dtMs: 0 });
    expect(pos(ctx, id)).toEqual({ x: 10, y: 20, z: 30 });
    expect(vel(ctx, id)).toEqual({ vx: 5, vy: -3, vz: 7 });
    expect(grounded(ctx, id).onGround).toBe(false);
  });

  it('simulates a body with no Grounded3 but reports nothing for it', () => {
    const sys = makeSystem(ctx.world, { gravity: 1000, terminalVelocity: 100000 });
    const id = spawnDynamic(ctx.world, 0, 0, 0, 10, 0, 0, false);
    sys.run({ ...ctx, dtMs: 500 });
    expect(pos(ctx, id)).toEqual({ x: 5, y: -250, z: 0 });
    expect(vel(ctx, id).vy).toBe(-500);
    expect(ctx.world.getStore(Grounded3Def).get(id)).toBeUndefined();
  });
});

describe('makeKinematics3DSystem broadphase contract', () => {
  let ctx: Ctx;
  beforeEach(() => {
    ctx = setup();
  });

  it('is called once per axis per body with that axis\' projected box', () => {
    const boxes: Aabb3[] = [];
    const sys = makeSystem(ctx.world, {
      broadphase: (_ctx, box) => {
        boxes.push({ center: { ...box.center }, half: { ...box.half } });
        return [];
      },
    });
    spawnDynamic(ctx.world, 1, 2, 3, 10, 20, 30);
    sys.run({ ...ctx, dtMs: 1000 });
    expect(boxes.map(b => b.center)).toEqual([
      { x: 11, y: 2, z: 3 },
      { x: 11, y: 2, z: 33 },
      { x: 11, y: 22, z: 33 },
    ]);
    expect(boxes.map(b => b.half)).toEqual([
      { x: 5, y: 5, z: 5 },
      { x: 5, y: 5, z: 5 },
      { x: 5, y: 5, z: 5 },
    ]);
  });

  it('ignores candidates that do not carry staticTag', () => {
    const other = ctx.world.createEntity();
    ctx.world.getStore(Position3DDef).set(other, { x: 50, y: 0, z: 0 });
    ctx.world.getStore(ShapeAabb3Def).set(other, { d: 10, h: 10, w: 10 });
    const sys = makeSystem(ctx.world, { broadphase: () => [other] });
    const id = spawnDynamic(ctx.world, 0, 0, 0, 45, 0, 0);
    sys.run({ ...ctx, dtMs: 1000 });
    expect(pos(ctx, id).x).toBe(45);
  });

  it('treats every yielded candidate as a collider when staticTag is omitted', () => {
    // A game that augments the candidate list with a movable body (portal's
    // resting cube) passes no tag, so the yield itself is the collider set —
    // including when, as here, the yield also names the body being resolved.
    const id = spawnDynamic(ctx.world, 0, 0, 0, 45, 0, 0);
    const wall = ctx.world.createEntity();
    ctx.world.getStore(Position3DDef).set(wall, { x: 50, y: 0, z: 0 });
    ctx.world.getStore(ShapeAabb3Def).set(wall, { d: 100, h: 100, w: 20 });
    const sys = makeSystem(ctx.world, { staticTag: undefined, broadphase: () => [wall, id] });
    sys.run({ ...ctx, dtMs: 1000 });
    expect(pos(ctx, id).x).toBe(35);
  });

  it('ignores a tagged static that has no shape', () => {
    const bare = ctx.world.createEntity();
    ctx.world.getStore(Position3DDef).set(bare, { x: 50, y: 0, z: 0 });
    ctx.world.getTag(StaticBodyTag).add(bare);
    const sys = makeSystem(ctx.world, { broadphase: () => [bare] });
    const id = spawnDynamic(ctx.world, 0, 0, 0, 45, 0, 0);
    sys.run({ ...ctx, dtMs: 1000 });
    expect(pos(ctx, id).x).toBe(45);
  });

  it('re-tests over-yielded candidates and skips ones that do not overlap', () => {
    const id = spawnDynamic(ctx.world, 0, 0, 0, 45, 0, 0);
    spawnStatic(ctx.world, 0, 500, 0, 100, 20, 100);
    makeSystem(ctx.world).run({ ...ctx, dtMs: 1000 });
    expect(pos(ctx, id).x).toBe(45);
  });

  it('skips the moving entity when the broadphase yields it', () => {
    const id = spawnDynamic(ctx.world, 0, 0, 0, 45, 0, 0);
    ctx.world.getTag(StaticBodyTag).add(id);
    makeSystem(ctx.world).run({ ...ctx, dtMs: 1000 });
    expect(pos(ctx, id).x).toBe(45);
  });
});

describe('makeKinematics3DSystem robustness', () => {
  let ctx: Ctx;
  beforeEach(() => {
    ctx = setup();
  });

  it('does nothing when no entity carries the dynamic tag', () => {
    expect(() => makeSystem(ctx.world).run({ ...ctx, dtMs: 1000 })).not.toThrow();
  });

  it('skips dynamic entities missing position, velocity, or shape', () => {
    const id = ctx.world.createEntity();
    ctx.world.getStore(Grounded3Def).set(id, { onGround: false });
    ctx.world.getTag(DynamicBodyTag).add(id);
    expect(() => makeSystem(ctx.world).run({ ...ctx, dtMs: 1000 })).not.toThrow();
  });
});
