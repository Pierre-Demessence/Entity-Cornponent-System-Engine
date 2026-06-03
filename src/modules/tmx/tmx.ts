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
  width: number;
}

/** A parsed TMX map: grid metrics, its tileset, and ordered tile layers. */
export interface TmxMap {
  height: number;
  /** Layers in file order (bottom-most first). */
  layers: TmxLayer[];
  tileHeight: number;
  tileset: TmxTileset;
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
  if (typeof DecompressionStream === 'undefined')
    throw new TypeError('tmx: DecompressionStream is not available in this environment');
  const source: ReadableStream<BufferSource> = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const stream = source.pipeThrough(new DecompressionStream('deflate'));
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

  return {
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

function parseTileset(xml: string, options: ParseTmxOptions): TmxTileset {
  const tags = [...xml.matchAll(/<tileset\b[^>]*>/g)];
  if (tags.length === 0)
    throw new Error('tmx: no <tileset> element found');
  if (tags.length > 1)
    throw new Error('tmx: multiple tilesets are not supported');
  const tilesetTag = tags[0]![0];
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
}

async function parseLayer(tag: string, inner: string): Promise<TmxLayer> {
  const name = readAttr(tag, 'name') ?? '';
  const width = readNumberAttr(tag, 'width', `layer '${name}'`);
  const height = readNumberAttr(tag, 'height', `layer '${name}'`);

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
    if (compression !== 'zlib')
      throw new Error(`tmx: layer '${name}' uses unsupported compression '${compression ?? '(none)'}' (only zlib)`);
    raw = bytesToRawGids(await inflateZlib(base64ToBytes(payload!)));
  }
  else {
    throw new Error(`tmx: layer '${name}' uses unsupported encoding '${encoding ?? '(none)'}' (only csv or base64)`);
  }

  const { flags, gids } = splitGidFlags(raw);
  return { name, flags, gids, height, width };
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

  const unsupportedLayer = xml.match(/<(objectgroup|imagelayer|group)\b/);
  if (unsupportedLayer)
    throw new Error(`tmx: '<${unsupportedLayer[1]}>' layers are not supported (only tile <layer>)`);

  const tileset = parseTileset(xml, options);

  const layers: TmxLayer[] = [];
  for (const match of xml.matchAll(/<layer\b([^>]*)>([\s\S]*?)<\/layer>/g))
    layers.push(await parseLayer(match[1]!, match[2]!));

  return {
    height: readNumberAttr(mapTag, 'height', '<map>'),
    layers,
    tileHeight: readNumberAttr(mapTag, 'tileheight', '<map>'),
    tileset,
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
