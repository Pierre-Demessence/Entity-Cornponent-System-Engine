/**
 * A single sub-texture rectangle within an atlas image, in source-image
 * pixel coordinates.
 */
export interface AtlasFrame {
  h: number;
  w: number;
  x: number;
  y: number;
}

/**
 * Result of parsing a TexturePacker / Kenney "Generic XML" atlas: the
 * referenced image path plus a map of frame name → source rectangle.
 */
export interface ParsedAtlas {
  frames: Record<string, AtlasFrame>;
  imagePath: string;
}

/**
 * A frame resolved against a loaded image, ready to hand to
 * `CanvasRenderingContext2D.drawImage` as the source rectangle.
 */
export interface ResolvedAtlasFrame {
  image: CanvasImageSource;
  sh: number;
  sw: number;
  sx: number;
  sy: number;
}

function readAttr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`));
  return match ? match[1] : undefined;
}

function readNumberAttr(tag: string, name: string, frameName: string): number {
  const raw = readAttr(tag, name);
  if (raw === undefined)
    throw new Error(`texture-atlas: frame '${frameName}' is missing required attribute '${name}'`);
  const value = Number(raw);
  if (!Number.isFinite(value))
    throw new Error(`texture-atlas: frame '${frameName}' has non-numeric '${name}': '${raw}'`);
  return value;
}

/**
 * Parses a TexturePacker / Kenney "Generic XML" sprite-atlas document.
 *
 * Expected shape (Kenney space packs, TexturePacker "Generic XML"):
 *
 * ```xml
 * <TextureAtlas imagePath="sheet.png">
 *   <SubTexture name="enemy_A.png" x="400" y="256" width="96" height="96"/>
 * </TextureAtlas>
 * ```
 *
 * Pure and DOM-free (regex-based) so it runs in any environment. Rotated
 * or trimmed frames are not supported — a `rotated="true"` attribute
 * throws rather than mis-rendering.
 *
 * @param xml Raw atlas XML document text.
 * @returns The image path and a frame-name → source-rect map.
 */
export function parseTexturePackerAtlas(xml: string): ParsedAtlas {
  const rootMatch = xml.match(/<TextureAtlas\b[^>]*>/);
  const imagePath = rootMatch ? (readAttr(rootMatch[0], 'imagePath') ?? '') : '';

  // Null-prototype map so untrusted frame names like '__proto__' or
  // 'constructor' become plain own keys instead of corrupting the prototype
  // or leaking inherited members into lookups.
  const frames: Record<string, AtlasFrame> = Object.create(null);
  const subTexturePattern = /<SubTexture\b[^>]*?\/?>/g;
  for (const match of xml.matchAll(subTexturePattern)) {
    const tag = match[0];
    const name = readAttr(tag, 'name');
    if (name === undefined)
      throw new Error('texture-atlas: <SubTexture> is missing required attribute \'name\'');

    const rotated = readAttr(tag, 'rotated');
    if (rotated === 'true' || rotated === 'yes')
      throw new Error(`texture-atlas: frame '${name}' is rotated, which is not supported`);

    frames[name] = {
      h: readNumberAttr(tag, 'height', name),
      w: readNumberAttr(tag, 'width', name),
      x: readNumberAttr(tag, 'x', name),
      y: readNumberAttr(tag, 'y', name),
    };
  }

  return { frames, imagePath };
}

/**
 * Resolves sprite `atlas` + `frame` names to a drawable image and source
 * rectangle. Register one or more loaded atlases, then pass the registry
 * to the renderer via `Canvas2DRenderContext.atlases`.
 */
export class TextureAtlasRegistry {
  private readonly atlases = new Map<
    string,
    { image: CanvasImageSource; frames: Record<string, AtlasFrame> }
  >();

  /**
   * Registers a loaded atlas image under `name` with its parsed frames.
   * Re-registering the same name replaces the previous entry.
   */
  add(name: string, image: CanvasImageSource, frames: Record<string, AtlasFrame>): this {
    this.atlases.set(name, { frames, image });
    return this;
  }

  /**
   * Resolves `atlas` + `frame` to a drawable image and source rect, or
   * `undefined` when either is unknown.
   */
  getFrame(atlas: string, frame: string): ResolvedAtlasFrame | undefined {
    const entry = this.atlases.get(atlas);
    if (!entry)
      return undefined;
    if (!Object.hasOwn(entry.frames, frame))
      return undefined;
    const f = entry.frames[frame];
    if (!f)
      return undefined;
    return { image: entry.image, sh: f.h, sw: f.w, sx: f.x, sy: f.y };
  }

  /** True when `atlas` is registered (and, if given, contains `frame`). */
  has(atlas: string, frame?: string): boolean {
    const entry = this.atlases.get(atlas);
    if (!entry)
      return false;
    return frame === undefined || Object.hasOwn(entry.frames, frame);
  }
}
