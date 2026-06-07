import { beforeEach, describe, expect, it } from 'vitest';

import { EcsWorld } from '#world';

import { PositionDef, RotationDef, VelocityDef } from '../transform';
import { AttachDef, makeAttachSystem } from './attach';

interface TestCtx {
  dtMs: number;
  world: EcsWorld;
}

describe('makeAttachSystem', () => {
  let world: EcsWorld;
  let system: ReturnType<typeof makeAttachSystem<TestCtx>>;

  beforeEach(() => {
    world = new EcsWorld();
    world.registerComponent(PositionDef);
    world.registerComponent(VelocityDef);
    world.registerComponent(RotationDef);
    world.registerComponent(AttachDef);
    system = makeAttachSystem<TestCtx>();
  });

  it('snapPosition: child position snaps to parent', () => {
    const parent = world.createEntity();
    world.getStore(PositionDef).set(parent, { x: 100, y: 200 });
    const child = world.createEntity();
    world.getStore(PositionDef).set(child, { x: 0, y: 0 });
    world.getStore(AttachDef).set(child, { parent, snapPosition: true });

    system.run({ dtMs: 16, world });

    const childPos = world.getStore(PositionDef).get(child)!;
    expect(childPos.x).toBe(100);
    expect(childPos.y).toBe(200);
  });

  it('snapRotation: child rotation snaps to parent', () => {
    const parent = world.createEntity();
    world.getStore(PositionDef).set(parent, { x: 0, y: 0 });
    world.getStore(RotationDef).set(parent, { angle: 1.5 });
    const child = world.createEntity();
    world.getStore(PositionDef).set(child, { x: 10, y: 10 });
    world.getStore(RotationDef).set(child, { angle: 0 });
    world.getStore(AttachDef).set(child, { parent, snapRotation: true });

    system.run({ dtMs: 16, world });

    const childRot = world.getStore(RotationDef).get(child)!;
    expect(childRot.angle).toBe(1.5);
  });

  it('inheritVelocity: child accumulates parent velocity × dt', () => {
    const parent = world.createEntity();
    world.getStore(PositionDef).set(parent, { x: 0, y: 0 });
    world.getStore(VelocityDef).set(parent, { vx: 60, vy: 0 });
    const child = world.createEntity();
    world.getStore(PositionDef).set(child, { x: 50, y: 50 });
    world.getStore(AttachDef).set(child, { inheritVelocity: true, parent });

    system.run({ dtMs: 1000, world }); // 1 second

    const childPos = world.getStore(PositionDef).get(child)!;
    expect(childPos.x).toBeCloseTo(110, 5); // 50 + 60 * 1
    expect(childPos.y).toBe(50);
  });

  it('inheritVelocity uses dtMs correctly (fractional tick)', () => {
    const parent = world.createEntity();
    world.getStore(PositionDef).set(parent, { x: 0, y: 0 });
    world.getStore(VelocityDef).set(parent, { vx: 0, vy: -120 });
    const child = world.createEntity();
    world.getStore(PositionDef).set(child, { x: 10, y: 100 });
    world.getStore(AttachDef).set(child, { inheritVelocity: true, parent });

    system.run({ dtMs: 250, world }); // 0.25 seconds

    const childPos = world.getStore(PositionDef).get(child)!;
    expect(childPos.y).toBeCloseTo(70, 5); // 100 + (-120 * 0.25)
  });

  it('snapPosition + inheritVelocity: snap wins (applied after inherit)', () => {
    const parent = world.createEntity();
    world.getStore(PositionDef).set(parent, { x: 100, y: 200 });
    world.getStore(VelocityDef).set(parent, { vx: 50, vy: 0 });
    const child = world.createEntity();
    world.getStore(PositionDef).set(child, { x: 0, y: 0 });
    world.getStore(AttachDef).set(child, { inheritVelocity: true, parent, snapPosition: true });

    system.run({ dtMs: 1000, world });

    // inheritVelocity adds velocity first, then snapPosition overwrites
    const childPos = world.getStore(PositionDef).get(child)!;
    expect(childPos.x).toBe(100); // snap wins
    expect(childPos.y).toBe(200);
  });

  it('does nothing when parent is missing', () => {
    const child = world.createEntity();
    world.getStore(PositionDef).set(child, { x: 5, y: 5 });
    world.getStore(AttachDef).set(child, { parent: 999, snapPosition: true });

    expect(() => system.run({ dtMs: 16, world })).not.toThrow();
    const childPos = world.getStore(PositionDef).get(child)!;
    expect(childPos.x).toBe(5); // unchanged
    expect(childPos.y).toBe(5);
  });

  it('supports multiple children attached to same parent', () => {
    const parent = world.createEntity();
    world.getStore(PositionDef).set(parent, { x: 42, y: 99 });
    const c1 = world.createEntity();
    world.getStore(PositionDef).set(c1, { x: 0, y: 0 });
    world.getStore(AttachDef).set(c1, { parent, snapPosition: true });
    const c2 = world.createEntity();
    world.getStore(PositionDef).set(c2, { x: -1, y: -1 });
    world.getStore(AttachDef).set(c2, { parent, snapPosition: true });

    system.run({ dtMs: 16, world });

    expect(world.getStore(PositionDef).get(c1)!.x).toBe(42);
    expect(world.getStore(PositionDef).get(c2)!.x).toBe(42);
  });

  it('is a no-op when no entities carry AttachDef', () => {
    const entity = world.createEntity();
    world.getStore(PositionDef).set(entity, { x: 5, y: 5 });
    // no AttachDef set

    expect(() => system.run({ dtMs: 16, world })).not.toThrow();
  });

  it('handles child without PositionDef gracefully', () => {
    const parent = world.createEntity();
    world.getStore(PositionDef).set(parent, { x: 0, y: 0 });
    const child = world.createEntity();
    // no PositionDef on child
    world.getStore(AttachDef).set(child, { parent, snapPosition: true });

    expect(() => system.run({ dtMs: 16, world })).not.toThrow();
  });
});
