import { describe, expect, it } from 'vitest';

import { PositionDef, RotationDef, VelocityDef } from './index';

describe('@pierre/ecs/modules/transform', () => {
  describe('positionDef', () => {
    it('round-trips numeric x/y', () => {
      const v = { x: 3, y: -4 };
      expect(PositionDef.deserialize(PositionDef.serialize(v), 'p')).toEqual(v);
    });

    it('rejects non-finite fields', () => {
      expect(() => PositionDef.deserialize({ x: Number.NaN, y: 0 }, 'p')).toThrow();
      expect(() => PositionDef.deserialize({ x: '3', y: 0 }, 'p')).toThrow();
    });
  });

  describe('velocityDef', () => {
    it('round-trips vx/vy', () => {
      const v = { vx: 1.5, vy: -2.25 };
      expect(VelocityDef.deserialize(VelocityDef.serialize(v), 'v')).toEqual(v);
    });

    it('rejects missing fields', () => {
      expect(() => VelocityDef.deserialize({ vx: 1 }, 'v')).toThrow();
    });
  });

  describe('rotationDef', () => {
    it('round-trips angle', () => {
      const v = { angle: Math.PI };
      expect(RotationDef.deserialize(RotationDef.serialize(v), 'r')).toEqual(v);
    });

    it('has distinct name from position/velocity', () => {
      expect(RotationDef.name).toBe('rotation');
      expect(PositionDef.name).toBe('position');
      expect(VelocityDef.name).toBe('velocity');
    });
  });
});
