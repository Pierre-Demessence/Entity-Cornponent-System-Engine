import { asArray, asBoolean, asNumber, asObject, asString } from '#validation';
import { describe, expect, it } from 'vitest';

describe('validation', () => {
  describe('asObject', () => {
    it('returns the value when given a plain object', () => {
      const obj = { a: 1 };
      expect(asObject(obj, 'test')).toBe(obj);
    });

    it('throws for null', () => {
      expect(() => asObject(null, 'val')).toThrow('val must be an object.');
    });

    it('throws for undefined', () => {
      expect(() => asObject(undefined, 'val')).toThrow('val must be an object.');
    });

    it('throws for arrays', () => {
      expect(() => asObject([1, 2], 'val')).toThrow('val must be an object.');
    });

    it('throws for primitives', () => {
      expect(() => asObject('str', 'val')).toThrow('val must be an object.');
      expect(() => asObject(42, 'val')).toThrow('val must be an object.');
      expect(() => asObject(true, 'val')).toThrow('val must be an object.');
    });
  });

  describe('asArray', () => {
    it('returns the array when given an array', () => {
      const arr = [1, 2, 3];
      expect(asArray(arr, 'test')).toBe(arr);
    });

    it('throws for non-arrays', () => {
      expect(() => asArray({}, 'val')).toThrow(TypeError);
      expect(() => asArray('str', 'val')).toThrow('val must be an array.');
      expect(() => asArray(null, 'val')).toThrow(TypeError);
    });
  });

  describe('asNumber', () => {
    it('returns the value for finite numbers', () => {
      expect(asNumber(42, 'n')).toBe(42);
      expect(asNumber(0, 'n')).toBe(0);
      expect(asNumber(-3.14, 'n')).toBe(-3.14);
    });

    it('throws for NaN', () => {
      expect(() => asNumber(Number.NaN, 'n')).toThrow(TypeError);
    });

    it('throws for Infinity', () => {
      expect(() => asNumber(Infinity, 'n')).toThrow('n must be a finite number.');
    });

    it('throws for non-numbers', () => {
      expect(() => asNumber('42', 'n')).toThrow(TypeError);
      expect(() => asNumber(null, 'n')).toThrow(TypeError);
    });
  });

  describe('asString', () => {
    it('returns the value for strings', () => {
      expect(asString('hello', 's')).toBe('hello');
      expect(asString('', 's')).toBe('');
    });

    it('throws for non-strings', () => {
      expect(() => asString(42, 's')).toThrow(TypeError);
      expect(() => asString(null, 's')).toThrow('s must be a string.');
    });
  });

  describe('asBoolean', () => {
    it('returns the value for booleans', () => {
      expect(asBoolean(true, 'b')).toBe(true);
      expect(asBoolean(false, 'b')).toBe(false);
    });

    it('throws for non-booleans', () => {
      expect(() => asBoolean(1, 'b')).toThrow(TypeError);
      expect(() => asBoolean('true', 'b')).toThrow('b must be a boolean.');
      expect(() => asBoolean(null, 'b')).toThrow(TypeError);
    });
  });
});
