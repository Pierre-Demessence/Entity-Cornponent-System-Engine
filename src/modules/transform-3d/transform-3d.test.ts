import { describe, expect, it } from 'vitest';

import { Position3DDef } from './position3d';
import { Rotation3DDef } from './rotation3d';
import { Scale3DDef } from './scale3d';
import { Velocity3DDef } from './velocity3d';

describe('@pierre/ecs/modules/transform-3d', () => {
  it('position3d round-trips through serialize/deserialize', () => {
    const value = { x: 1, y: 2, z: 3 };
    const raw = Position3DDef.serialize(value);
    expect(Position3DDef.deserialize(raw, 'a')).toEqual(value);
  });

  it('velocity3d round-trips through serialize/deserialize', () => {
    const value = { vx: -1, vy: 0.5, vz: 2 };
    const raw = Velocity3DDef.serialize(value);
    expect(Velocity3DDef.deserialize(raw, 'a')).toEqual(value);
  });

  it('rotation3d round-trips through serialize/deserialize', () => {
    const value = { w: 1, x: 0, y: 0, z: 0 };
    const raw = Rotation3DDef.serialize(value);
    expect(Rotation3DDef.deserialize(raw, 'a')).toEqual(value);
  });

  it('scale3d round-trips through serialize/deserialize', () => {
    const value = { x: 2, y: 1, z: 0.5 };
    const raw = Scale3DDef.serialize(value);
    expect(Scale3DDef.deserialize(raw, 'a')).toEqual(value);
  });

  it('names position3d/velocity3d to match collision-3d and kinematics-3d requires', () => {
    expect(Position3DDef.name).toBe('position3d');
    expect(Velocity3DDef.name).toBe('velocity3d');
    expect(Rotation3DDef.name).toBe('rotation3d');
    expect(Scale3DDef.name).toBe('scale3d');
  });
});
