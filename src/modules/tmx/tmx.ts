/**
 * Minimal parser for the [Tiled TMX map format](https://doc.mapeditor.org/en/stable/reference/tmx-map-format/).
 *
 * Scope — only what an image-based orthogonal map exercises:
 * - orthogonal maps with a single image-based tileset,
 * - the tileset inline in the `.tmx` or referenced as an external `.tsx`
 *   (whose text is supplied via {@link ParseTmxOptions.tilesets}),
 * - tile-layer `<data>` encoded as `csv`, or as `base64` compressed with
 *   `zlib`,
 * - per-tile horizontal/vertical/diagonal flip flags, exposed on
 *   {@link TmxLayer.flags} while {@link TmxLayer.gids} stays flag-masked.
 *
 * Deliberately unsupported (throws or ignores): `gzip`/`zstd`/uncompressed
 * encodings, multiple tilesets, object/image/group layers, and
 * infinite/chunked maps.
 *
 * Pure and DOM-free apart from `atob` + `DecompressionStream`, both of
 * which are standard web platform APIs.
 */

/** Global-tile-ID flip/rotation flags occupy the top 4 bits. */
const GID_FLAG_MASK = 0x0FFFFFFF;

/** Raw GID bit set when a tile is flipped horizontally. */
const RAW_FLIP_H = 0x80000000;
/** Raw GID bit set when a tile is flipped vertically. */
const RAW_FLIP_V = 0x40000000;
/** Raw GID bit set when a tile is flipped along its main diagonal. */
const RAW_FLIP_D = 0x20000000;

/** {@link TmxLayer.flags} bit: tile is mirrored horizontally. */
export const TMX_FLIP_H = 1;
/** {@link TmxLayer.flags} bit: tile is mirrored vertically. */
export const TMX_FLIP_V = 2;
/** {@link TmxLayer.flags} bit: tile is transposed across its main diagonal. */
export const TMX_FLIP_D = 4;

/** Options controlling how {@link parseTmx} resolves external resources. */
export interface ParseTmxOptions {
  /** Maps each external tileset `source` path to its `.tsx` document text. */
  tilesets?: Record<string, string>;
}

/** A single image-based tileset cut into a uniform grid. */
export interface TmxTileset {
  /** Tileset name. */
  name: string;
  /** Number of tile columns in the sheet (derived if not declared). */
  columns: number;
  /** Global id of this tileset's first tile (first tile id is 1). */
  firstgid: number;
  /** Source-image height in pixels. */
  imageHeight: number;
  /** Tileset image path, relative to the `.tmx` file. */
  imageSource: string;
  /** Source-image width in pixels. */
  imageWidth: number;
  /** Transparent margin around the tile grid, in pixels. */
  margin: number;
  /** Gap between adjacent tiles, in pixels. */
  spacing: number;
  /** Tile height in pixels. */
  tileHeight: number;
  /** Tile width in pixels. */
  tileWidth: number;
}

/** Result of resolving a global tile ID against a map's tilesets. */
export interface ResolvedTile {
  /** Local tile ID within the tileset (0-based). */
  localId: number;
  /** The tileset this tile belongs to. */
  tileset: TmxTileset;
}

/**
 * Resolve a global tile ID to its owning tileset and local tile index.
 * Returns `undefined` when `gid` is 0 (empty cell) or doesn't belong to
 * any tileset.
 */
export function resolveGid(map: TmxMap, gid: number): ResolvedTile | undefined {
  if (gid === 0)
    return undefined;
  // Tilesets are ordered by ascending firstgid
  for (let i = map.tilesets.length - 1; i >= 0; i--) {
    const ts = map.tilesets[i]!;
    if (gid >= ts.firstgid)
      return { localId: gid - ts.firstgid, tileset: ts };
  }
  return undefined;
}

// ── Object layers ─────────────────────────────────────────────────────

/** A TMX object group (object layer). */
export interface TmxObjectGroup {
  name: string;
  /** Hex color used to display objects in Tiled. */
  color?: string;
  /** Draw order: 'index' (file order) or 'topdown' (by y-coordinate). */
  draworder: 'index' | 'topdown';
  /** Objects in this group. */
  objects: TmxObject[];
  /** Horizontal offset in pixels. */
  offsetX: number;
  /** Vertical offset in pixels. */
  offsetY: number;
  /** Opacity from 0 to 1. */
  opacity: number;
  /** Custom properties. */
  properties?: TmxProperties;
  /** Whether the layer is shown. */
  visible: boolean;
}

/** Text label attached to an object (since Tiled 1.0). */
export interface TmxText {
  bold: boolean;
  color: string;
  fontfamily: string;
  halign: 'center' | 'justify' | 'left' | 'right';
  italic: boolean;
  kerning: boolean;
  pixelsize: number;
  strikeout: boolean;
  /** The text content. */
  text: string;
  underline: boolean;
  valign: 'bottom' | 'center' | 'top';
  wrap: boolean;
}

/** A single object in an object group. */
export interface TmxObject {
  /** Unique ID. */
  id: number;
  /** Object name. */
  name: string;
  /** True when the object is an ellipse-shaped region. */
  ellipse?: boolean;
  /** Reference to a global tile ID (tile objects). */
  gid?: number;
  /** Height in pixels. */
  height: number;
  /** Polygon vertices, relative to (x, y). */
  polygon?: readonly { x: number; y: number }[];
  /** Polyline vertices, relative to (x, y). */
  polyline?: readonly { x: number; y: number }[];
  /** Custom properties. */
  properties?: TmxProperties;
  /** Rotation in degrees clockwise. */
  rotation: number;
  /** Text label (text objects). */
  text?: TmxText;
  /** Object class/type. */
  type: string;
  /** Whether the object is visible. */
  visible: boolean;
  /** Width in pixels. */
  width: number;
  /** X coordinate in pixels. */
  x: number;
  /** Y coordinate in pixels. */
  y: number;
}

function parseText(tag: string): TmxText {
  return {
    bold: (readAttr(tag, 'bold') ?? '0') !== '0',
    color: readAttr(tag, 'color') ?? '#000000',
    fontfamily: readAttr(tag, 'fontfamily') ?? 'sans-serif',
    halign: (readAttr(tag, 'halign') ?? 'left') as TmxText['halign'],
    italic: (readAttr(tag, 'italic') ?? '0') !== '0',
    kerning: (readAttr(tag, 'kerning') ?? '1') !== '0',
    pixelsize: Number(readAttr(tag, 'pixelsize') ?? '16'),
    strikeout: (readAttr(tag, 'strikeout') ?? '0') !== '0',
    text: '',
    underline: (readAttr(tag, 'underline') ?? '0') !== '0',
    valign: (readAttr(tag, 'valign') ?? 'top') as TmxText['valign'],
    wrap: (readAttr(tag, 'wrap') ?? '0') !== '0',
  };
}

function parsePoints(attr: string | undefined): { x: number; y: number }[] {
  if (!attr)
    return [];
  return attr.split(' ').map((p) => {
    const [x, y] = p.split(',');
    return { x: Number(x), y: Number(y) };
  });
}

function parseObject(tag: string, inner: string): TmxObject {
  const hasEllipse = /<ellipse\b/.test(inner);
  const hasPoint = /<point\b/.test(inner);
  const polygonMatch = inner.match(/<polygon\b[^>]+points="([^"]*)"/);
  const polylineMatch = inner.match(/<polyline\b[^>]+points="([^"]*)"/);
  const textMatch = inner.match(/<text\b([^>]*)>([\s\S]*?)<\/text>/);
  const propsMatch = inner.match(/<properties>([\s\S]*?)<\/properties>/);

  const text = textMatch ? { ...parseText(textMatch[1]!), text: textMatch[2]?.trim() ?? '' } : undefined;
  const obj: TmxObject = {
    id: Number(readAttr(tag, 'id') ?? '0'),
    name: readAttr(tag, 'name') ?? '',
    ellipse: hasEllipse || undefined,
    gid: Number(readAttr(tag, 'gid') ?? '0') || undefined,
    height: Number(readAttr(tag, 'height') ?? '0'),
    polygon: polygonMatch ? parsePoints(polygonMatch[1]) : undefined,
    polyline: polylineMatch ? parsePoints(polylineMatch[1]) : undefined,
    properties: propsMatch ? parseProperties(propsMatch[1]!) : undefined,
    rotation: Number(readAttr(tag, 'rotation') ?? '0'),
    text,
    type: readAttr(tag, 'type') ?? readAttr(tag, 'class') ?? '',
    visible: (readAttr(tag, 'visible') ?? '1') !== '0',
    width: Number(readAttr(tag, 'width') ?? '0'),
    x: Number(readAttr(tag, 'x') ?? '0'),
    y: Number(readAttr(tag, 'y') ?? '0'),
  };
  return hasPoint ? { ...obj, ellipse: undefined, height: 0, width: 0 } : obj;
}

function parseObjectGroup(tag: string, inner: string): TmxObjectGroup {
  const objects: TmxObject[] = [];
  // Match both <object ... /> (self-closing) and <object ...>...</object>
  for (const m of inner.matchAll(/<object\b([^>]+?)(?:\/>|>([\s\S]*?)<\/object>)/g))
    objects.push(parseObject(m[1]!, m[2] ?? ''));

  const propsMatch = inner.match(/<properties>([\s\S]*?)<\/properties>/);
  return {
    name: readAttr(tag, 'name') ?? '',
    color: readAttr(tag, 'color'),
    draworder: (readAttr(tag, 'draworder') ?? 'topdown') as 'index' | 'topdown',
    objects,
    offsetX: Number(readAttr(tag, 'offsetx') ?? '0'),
    offsetY: Number(readAttr(tag, 'offsety') ?? '0'),
    opacity: Number(readAttr(tag, 'opacity') ?? '1'),
    properties: propsMatch ? parseProperties(propsMatch[1]!) : undefined,
    visible: (readAttr(tag, 'visible') ?? '1') !== '0',
  };
}

// ── Properties ─────────────────────────────────────────────────────────

/** A single custom property. */
export interface TmxProperty {
  name: string;
  type: 'bool' | 'color' | 'file' | 'float' | 'int' | 'object' | 'string';
  value: string;
}

/** Map of property name to property value. */
export type TmxProperties = Record<string, TmxProperty>;

function parseProperties(inner: string): TmxProperties {
  const props: TmxProperties = {};
  for (const m of inner.matchAll(/<property\b([^>]*?)\/>/g)) {
    const tag = m[1]!;
    const name = readAttr(tag, 'name') ?? '';
    if (!name)
      continue;
    props[name] = {
      name,
      type: (readAttr(tag, 'type') ?? 'string') as TmxProperty['type'],
      value: readAttr(tag, 'value') ?? '',
    };
  }
  return props;
}

/** One tile layer: a row-major grid of (flag-masked) global tile ids. */
export interface TmxLayer {
  name: string;
  /**
   * Row-major per-tile flip flags, parallel to {@link gids}: a bitfield of
   * {@link TMX_FLIP_H} | {@link TMX_FLIP_V} | {@link TMX_FLIP_D}.
   */
  flags: Uint8Array;
  /** Row-major global tile ids; `0` marks an empty cell. */
  gids: Uint32Array;
  height: number;
  /** Horizontal offset in pixels. Defaults to 0. */
  offsetX: number;
  /** Vertical offset in pixels. Defaults to 0. */
  offsetY: number;
  /** Opacity from 0 to 1. Defaults to 1. */
  opacity: number;
  /** Whether the layer is shown. Defaults to true. */
  visible: boolean;
  width: number;
}

/** A parsed TMX map: grid metrics, tilesets, and ordered tile layers. */
export interface TmxMap {
  height: number;
  /** Layers in file order (bottom-most first). */
  layers: TmxLayer[];
  /** Object groups in file order. */
  objectGroups: TmxObjectGroup[];
  tileHeight: number;
  /** Tilesets ordered by increasing `firstgid`. */
  tilesets: TmxTileset[];
  tileWidth: number;
  width: number;
}

/** A source rectangle within the tileset image, in pixels. */
export interface TmxFrame {
  h: number;
  w: number;
  x: number;
  y: number;
}

function readAttr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`));
  return match ? match[1] : undefined;
}

function readNumberAttr(tag: string, name: string, context: string): number {
  const raw = readAttr(tag, name);
  if (raw === undefined)
    throw new Error(`tmx: ${context} is missing required attribute '${name}'`);
  const value = Number(raw);
  if (!Number.isFinite(value))
    throw new Error(`tmx: ${context} has non-numeric '${name}': '${raw}'`);
  return value;
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++)
    bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function inflateZlib(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return decompress(bytes, 'deflate');
}

async function inflateGzip(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return decompress(bytes, 'gzip');
}

async function decompress(bytes: Uint8Array<ArrayBuffer>, format: 'deflate' | 'gzip'): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof DecompressionStream === 'undefined')
    throw new TypeError('tmx: DecompressionStream is not available in this environment');
  const source: ReadableStream<BufferSource> = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const stream = source.pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function bytesToRawGids(bytes: Uint8Array): Uint32Array {
  const count = bytes.byteLength >>> 2;
  const view = new DataView(bytes.buffer, bytes.byteOffset, count * 4);
  const raw = new Uint32Array(count);
  for (let i = 0; i < count; i++)
    raw[i] = view.getUint32(i * 4, true);
  return raw;
}

function parseCsvGids(payload: string, name: string): Uint32Array {
  const raw: number[] = [];
  for (const token of payload.split(',')) {
    const trimmed = token.trim();
    if (trimmed === '')
      continue;
    const value = Number(trimmed);
    if (!Number.isFinite(value))
      throw new Error(`tmx: layer '${name}' has non-numeric csv gid '${trimmed}'`);
    raw.push(value >>> 0);
  }
  return Uint32Array.from(raw);
}

/** Splits raw GIDs into flag-masked ids and a parallel flip-flag bitfield. */
function splitGidFlags(raw: Uint32Array): { flags: Uint8Array; gids: Uint32Array } {
  const gids = new Uint32Array(raw.length);
  const flags = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const value = raw[i]!;
    let flag = 0;
    if ((value & RAW_FLIP_H) !== 0)
      flag |= TMX_FLIP_H;
    if ((value & RAW_FLIP_V) !== 0)
      flag |= TMX_FLIP_V;
    if ((value & RAW_FLIP_D) !== 0)
      flag |= TMX_FLIP_D;
    gids[i] = value & GID_FLAG_MASK;
    flags[i] = flag;
  }
  return { flags, gids };
}

/**
 * Builds a tileset from its defining `<tileset>` tag and the document that
 * holds the matching `<image>`. `firstgid` comes from the map (external
 * `.tsx` files omit it), so it is passed in explicitly.
 */
function buildTileset(tilesetTag: string, imageScope: string, firstgid: number): TmxTileset {
  const imageMatch = imageScope.match(/<image\b[^>]*>/);
  if (!imageMatch)
    throw new Error('tmx: tileset is missing its <image> element');
  const imageTag = imageMatch[0];
  const imageSource = readAttr(imageTag, 'source');
  if (imageSource === undefined)
    throw new Error('tmx: <image> is missing required attribute \'source\'');

  const tileWidth = readNumberAttr(tilesetTag, 'tilewidth', '<tileset>');
  const tileHeight = readNumberAttr(tilesetTag, 'tileheight', '<tileset>');
  const spacing = Number(readAttr(tilesetTag, 'spacing') ?? '0');
  const margin = Number(readAttr(tilesetTag, 'margin') ?? '0');
  const imageWidth = readNumberAttr(imageTag, 'width', '<image>');
  const imageHeight = readNumberAttr(imageTag, 'height', '<image>');
  const declaredColumns = readAttr(tilesetTag, 'columns');
  const columns = declaredColumns !== undefined
    ? Number(declaredColumns)
    : Math.floor((imageWidth - margin + spacing) / (tileWidth + spacing));
  const name = readAttr(tilesetTag, 'name') ?? '';

  return {
    name,
    columns,
    firstgid,
    imageHeight,
    imageSource,
    imageWidth,
    margin,
    spacing,
    tileHeight,
    tileWidth,
  };
}

function parseTilesets(xml: string, options: ParseTmxOptions): TmxTileset[] {
  const tags = [...xml.matchAll(/<tileset\b[^>]*>/g)];
  if (tags.length === 0)
    throw new Error('tmx: no <tileset> element found');

  return tags.map((t) => {
    const tilesetTag = t[0];
    const firstgid = readNumberAttr(tilesetTag, 'firstgid', '<tileset>');

    const source = readAttr(tilesetTag, 'source');
    if (source !== undefined) {
      const tsx = options.tilesets?.[source];
      if (tsx === undefined)
        throw new Error(`tmx: external tileset '${source}' not provided (pass it via parseTmx options.tilesets)`);
      const tsxTag = tsx.match(/<tileset\b[^>]*>/);
      if (!tsxTag)
        throw new Error(`tmx: external tileset '${source}' has no <tileset> element`);
      return buildTileset(tsxTag[0], tsx, firstgid);
    }

    return buildTileset(tilesetTag, xml, firstgid);
  });
}

async function parseLayer(tag: string, inner: string): Promise<TmxLayer> {
  const name = readAttr(tag, 'name') ?? '';
  const width = readNumberAttr(tag, 'width', `layer '${name}'`);
  const height = readNumberAttr(tag, 'height', `layer '${name}'`);
  const opacity = Number(readAttr(tag, 'opacity') ?? '1');
  const visible = (readAttr(tag, 'visible') ?? '1') !== '0';
  const offsetX = Number(readAttr(tag, 'offsetx') ?? '0');
  const offsetY = Number(readAttr(tag, 'offsety') ?? '0');

  const dataMatch = inner.match(/<data\b([^>]*)>([\s\S]*?)<\/data>/);
  if (!dataMatch)
    throw new Error(`tmx: layer '${name}' has no <data> element`);
  const [, dataAttrs, payload] = dataMatch;

  const encoding = readAttr(dataAttrs!, 'encoding');
  let raw: Uint32Array;
  if (encoding === 'csv') {
    raw = parseCsvGids(payload!, name);
  }
  else if (encoding === 'base64') {
    const compression = readAttr(dataAttrs!, 'compression');
    if (compression !== 'zlib' && compression !== 'gzip')
      throw new Error(`tmx: layer '${name}' uses unsupported compression '${compression ?? '(none)'}' (only zlib and gzip)`);
    const inflated = compression === 'gzip'
      ? await inflateGzip(base64ToBytes(payload!))
      : await inflateZlib(base64ToBytes(payload!));
    raw = bytesToRawGids(inflated);
  }
  else {
    throw new Error(`tmx: layer '${name}' uses unsupported encoding '${encoding ?? '(none)'}' (only csv or base64)`);
  }

  const { flags, gids } = splitGidFlags(raw);
  return { name, flags, gids, height, offsetX, offsetY, opacity, visible, width };
}

/**
 * Parses a TMX document into grid metrics, a single tileset, and ordered
 * tile layers. Async because layer payloads are inflated via
 * `DecompressionStream`.
 *
 * @param xml Raw `.tmx` document text.
 * @param options External-resource resolution (e.g. `.tsx` tileset text).
 * @throws When the map uses an unsupported feature (see module scope).
 */
export async function parseTmx(xml: string, options: ParseTmxOptions = {}): Promise<TmxMap> {
  const mapMatch = xml.match(/<map\b[^>]*>/);
  if (!mapMatch)
    throw new Error('tmx: no <map> element found');
  const mapTag = mapMatch[0];

  const orientation = readAttr(mapTag, 'orientation');
  if (orientation !== undefined && orientation !== 'orthogonal')
    throw new Error(`tmx: only orthogonal maps are supported, got '${orientation}'`);
  if (readAttr(mapTag, 'infinite') === '1')
    throw new Error('tmx: infinite maps are not supported');

  const tilesets = parseTilesets(xml, options);

  const layers: TmxLayer[] = [];
  for (const match of xml.matchAll(/<layer\b([^>]*)>([\s\S]*?)<\/layer>/g))
    layers.push(await parseLayer(match[1]!, match[2]!));

  const objectGroups: TmxObjectGroup[] = [];
  for (const match of xml.matchAll(/<objectgroup\b([^>]*)>([\s\S]*?)<\/objectgroup>/g))
    objectGroups.push(parseObjectGroup(match[1]!, match[2]!));

  return {
    height: readNumberAttr(mapTag, 'height', '<map>'),
    layers,
    objectGroups,
    tileHeight: readNumberAttr(mapTag, 'tileheight', '<map>'),
    tilesets,
    tileWidth: readNumberAttr(mapTag, 'tilewidth', '<map>'),
    width: readNumberAttr(mapTag, 'width', '<map>'),
  };
}

/**
 * Resolves a global tile id to its source rectangle within the tileset
 * image. The id must already have flip flags masked off (as produced by
 * {@link parseTmx}). Callers must skip `gid === 0` (empty).
 */
export function gidToFrame(gid: number, tileset: TmxTileset): TmxFrame {
  const local = gid - tileset.firstgid;
  const col = local % tileset.columns;
  const row = Math.floor(local / tileset.columns);
  return {
    h: tileset.tileHeight,
    w: tileset.tileWidth,
    x: tileset.margin + col * (tileset.tileWidth + tileset.spacing),
    y: tileset.margin + row * (tileset.tileHeight + tileset.spacing),
  };
}
