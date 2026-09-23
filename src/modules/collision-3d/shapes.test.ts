import { describe, expect, it } from 'vitest';

import { ShapeAabb3Def } from './shape-aabb3';
import { ShapeSphere3Def } from './shape-sphere3';

describe('shapeAabb3Def', () => {
  it('round-trips through serialize/deserialize', () => {
    const value = { d: 4, h: 20, w: 10 };
    const raw = ShapeAabb3Def.serialize(value);
    expect(ShapeAabb3Def.deserialize(raw, 'a')).toEqual(value);
  });

  it('requires a 3D position', () => {
    expect(ShapeAabb3Def.requires).toEqual(['position3d']);
  });
});

describe('shapeSphere3Def', () => {
  it('round-trips through serialize/deserialize', () => {
    const value = { radius: 1.6 };
    const raw = ShapeSphere3Def.serialize(value);
    expect(ShapeSphere3Def.deserialize(raw, 's')).toEqual(value);
  });

  it('requires a 3D position', () => {
    expect(ShapeSphere3Def.requires).toEqual(['position3d']);
  });
});
