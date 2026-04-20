import type { TagDef } from '#component-store';

import { createTestWorld, GenericEntityBuilder } from '#test-utils';
import { describe, expect, it } from 'vitest';

import { TurnCycler } from './turn-cycler';

const ControlledTag: TagDef = { name: 'controlled' };
const ActiveTurnTag: TagDef = { name: 'activeTurn' };
const CameraTargetTag: TagDef = { name: 'cameraTarget' };

function setup(withCamera = false) {
  const world = createTestWorld();
  world.registerTag(ControlledTag);
  world.registerTag(ActiveTurnTag);
  if (withCamera)
    world.registerTag(CameraTargetTag);

  const cycler = new TurnCycler(world, {
    activeTurn: ActiveTurnTag,
    controlled: ControlledTag,
    ...(withCamera ? { cameraTarget: CameraTargetTag } : {}),
  });
  return { cycler, world };
}

describe('turnCycler', () => {
  it('treats an empty controlled set as "all acted"', () => {
    const { cycler } = setup();
    expect(cycler.allControlledEntitiesActed).toBe(true);
    expect(cycler.activeEntityId).toBeUndefined();
    expect(cycler.advance()).toBe(true);
  });

  it('treats a single controlled entity as "all acted" and advance is a no-op', () => {
    const { cycler, world } = setup();
    const a = new GenericEntityBuilder(world).tag(ControlledTag).tag(ActiveTurnTag).build();

    expect(cycler.activeEntityId).toBe(a);
    expect(cycler.allControlledEntitiesActed).toBe(true);
    expect(cycler.advance()).toBe(true);
    expect(cycler.activeEntityId).toBe(a);
  });

  it('round-robins active-turn across multiple controlled entities', () => {
    const { cycler, world } = setup();
    const a = new GenericEntityBuilder(world).tag(ControlledTag).tag(ActiveTurnTag).build();
    const b = new GenericEntityBuilder(world).tag(ControlledTag).build();
    const c = new GenericEntityBuilder(world).tag(ControlledTag).build();

    expect(cycler.activeEntityId).toBe(a);
    expect(cycler.advance()).toBe(false);
    expect(cycler.activeEntityId).toBe(b);
    expect(cycler.allControlledEntitiesActed).toBe(false);

    expect(cycler.advance()).toBe(false);
    expect(cycler.activeEntityId).toBe(c);

    expect(cycler.advance()).toBe(true);
    expect(cycler.activeEntityId).toBe(a);
    expect(cycler.allControlledEntitiesActed).toBe(true);
  });

  it('moves cameraTarget in lockstep when configured', () => {
    const { cycler, world } = setup(true);
    const a = new GenericEntityBuilder(world)
      .tag(ControlledTag)
      .tag(ActiveTurnTag)
      .tag(CameraTargetTag)
      .build();
    const b = new GenericEntityBuilder(world).tag(ControlledTag).build();

    cycler.advance();
    expect(world.getTag(CameraTargetTag).has(a)).toBe(false);
    expect(world.getTag(CameraTargetTag).has(b)).toBe(true);
  });

  it('ignores cameraTarget when not configured', () => {
    const { cycler, world } = setup();
    const a = new GenericEntityBuilder(world).tag(ControlledTag).tag(ActiveTurnTag).build();
    new GenericEntityBuilder(world).tag(ControlledTag).build();

    expect(() => cycler.advance()).not.toThrow();
    expect(cycler.activeEntityId).not.toBe(a);
  });

  it('returns true when the active entity is no longer controlled', () => {
    const { cycler, world } = setup();
    new GenericEntityBuilder(world).tag(ControlledTag).build();
    new GenericEntityBuilder(world).tag(ControlledTag).build();
    const ghost = new GenericEntityBuilder(world).tag(ActiveTurnTag).build();

    expect(cycler.activeEntityId).toBe(ghost);
    expect(cycler.advance()).toBe(true);
  });

  it('survives entities being added mid-round (they join the rotation)', () => {
    const { cycler, world } = setup();
    const a = new GenericEntityBuilder(world).tag(ControlledTag).tag(ActiveTurnTag).build();
    const b = new GenericEntityBuilder(world).tag(ControlledTag).build();

    expect(cycler.advance()).toBe(false);
    expect(cycler.activeEntityId).toBe(b);

    const c = new GenericEntityBuilder(world).tag(ControlledTag).build();
    expect(cycler.advance()).toBe(false);
    expect(cycler.activeEntityId).toBe(c);

    expect(cycler.advance()).toBe(true);
    expect(cycler.activeEntityId).toBe(a);
  });
});
