import { describe, expect, it } from 'vitest';

import { parseTexturePackerAtlas, TextureAtlasRegistry } from './texture-atlas';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<TextureAtlas imagePath="simpleSpace_sheet@2.png">
  <SubTexture name="effect_purple.png" x="688" y="160" width="64" height="127"/>
  <SubTexture name="enemy_A.png" x="400" y="256" width="96" height="96"/>
  <SubTexture name="ship_A.png" x="0" y="0" width="96" height="96"/>
</TextureAtlas>`;

describe('parseTexturePackerAtlas', () => {
  it('extracts the image path from the root element', () => {
    expect(parseTexturePackerAtlas(SAMPLE).imagePath).toBe('simpleSpace_sheet@2.png');
  });

  it('parses every sub-texture into a frame rect', () => {
    const { frames } = parseTexturePackerAtlas(SAMPLE);
    expect(frames['enemy_A.png']).toEqual({ h: 96, w: 96, x: 400, y: 256 });
    expect(frames['effect_purple.png']).toEqual({ h: 127, w: 64, x: 688, y: 160 });
    expect(Object.keys(frames)).toHaveLength(3);
  });

  it('handles self-closing tags with arbitrary whitespace and attribute order', () => {
    const xml = '<TextureAtlas imagePath="s.png"><SubTexture height="8" name="a" width="4" y="2" x="1" /></TextureAtlas>';
    expect(parseTexturePackerAtlas(xml).frames.a).toEqual({ h: 8, w: 4, x: 1, y: 2 });
  });

  it('returns an empty image path when the root has none', () => {
    expect(parseTexturePackerAtlas('<TextureAtlas></TextureAtlas>').imagePath).toBe('');
  });

  it('throws when a sub-texture is missing a required numeric attribute', () => {
    const xml = '<TextureAtlas><SubTexture name="a" x="1" y="2" width="4"/></TextureAtlas>';
    expect(() => parseTexturePackerAtlas(xml)).toThrow(/height/);
  });

  it('throws on a non-numeric coordinate', () => {
    const xml = '<TextureAtlas><SubTexture name="a" x="nope" y="2" width="4" height="8"/></TextureAtlas>';
    expect(() => parseTexturePackerAtlas(xml)).toThrow(/non-numeric/);
  });

  it('throws on rotated frames rather than mis-rendering', () => {
    const xml = '<TextureAtlas><SubTexture name="a" x="1" y="2" width="4" height="8" rotated="true"/></TextureAtlas>';
    expect(() => parseTexturePackerAtlas(xml)).toThrow(/rotated/);
  });

  it('does not corrupt the prototype for a frame named __proto__', () => {
    const xml = '<TextureAtlas><SubTexture name="__proto__" x="1" y="2" width="4" height="8"/></TextureAtlas>';
    const { frames } = parseTexturePackerAtlas(xml);
    const descriptor = Object.getOwnPropertyDescriptor(frames, '__proto__');
    expect(descriptor?.value).toEqual({ h: 8, w: 4, x: 1, y: 2 });
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });
});

describe('textureAtlasRegistry', () => {
  const image = {} as CanvasImageSource;

  it('resolves a registered frame to image + source rect', () => {
    const registry = new TextureAtlasRegistry();
    registry.add('space', image, parseTexturePackerAtlas(SAMPLE).frames);

    expect(registry.getFrame('space', 'enemy_A.png')).toEqual({
      image,
      sh: 96,
      sw: 96,
      sx: 400,
      sy: 256,
    });
  });

  it('returns undefined for unknown atlas or frame', () => {
    const registry = new TextureAtlasRegistry();
    registry.add('space', image, parseTexturePackerAtlas(SAMPLE).frames);

    expect(registry.getFrame('missing', 'enemy_A.png')).toBeUndefined();
    expect(registry.getFrame('space', 'missing.png')).toBeUndefined();
  });

  it('reports membership via has', () => {
    const registry = new TextureAtlasRegistry();
    registry.add('space', image, parseTexturePackerAtlas(SAMPLE).frames);

    expect(registry.has('space')).toBe(true);
    expect(registry.has('space', 'ship_A.png')).toBe(true);
    expect(registry.has('space', 'nope')).toBe(false);
    expect(registry.has('nope')).toBe(false);
  });

  it('does not leak inherited object keys as frames', () => {
    const registry = new TextureAtlasRegistry();
    registry.add('space', image, parseTexturePackerAtlas(SAMPLE).frames);

    expect(registry.has('space', 'toString')).toBe(false);
    expect(registry.has('space', 'constructor')).toBe(false);
    expect(registry.getFrame('space', 'constructor')).toBeUndefined();
    expect(registry.getFrame('space', 'hasOwnProperty')).toBeUndefined();
  });
});
