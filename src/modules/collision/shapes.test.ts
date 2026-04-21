import { describe, expect, it } from 'vitest';

import { ShapeAabbDef } from './shape-aabb';
import { ShapeCircleDef } from './shape-circle';

describe('shapeAabbDef', () => {
  it('round-trips through serialize/deserialize', () => {
    const value = { h: 20, w: 10 };
    const raw = ShapeAabbDef.serialize(value);
    expect(ShapeAabbDef.deserialize(raw, 'a')).toEqual(value);
  });

  it('requires position', () => {
    expect(ShapeAabbDef.requires).toEqual(['position']);
  });
});

describe('shapeCircleDef', () => {
  it('round-trips through serialize/deserialize', () => {
    const value = { radius: 5 };
    const raw = ShapeCircleDef.serialize(value);
    expect(ShapeCircleDef.deserialize(raw, 'c')).toEqual(value);
  });

  it('requires position', () => {
    expect(ShapeCircleDef.requires).toEqual(['position']);
  });
});
