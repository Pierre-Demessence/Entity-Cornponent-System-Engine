/**
 * Minimal parser for the [Tiled TMX map format](https://doc.mapeditor.org/en/stable/reference/tmx-map-format/).
 *
 * Scope — only what an image-based orthogonal map exercises:
 * - orthogonal maps with a single image-based tileset,
 * - tile-layer `<data>` encoded as `base64` and compressed with `zlib`.
 *
 * Deliberately unsupported (throws or ignores): `csv`/`gzip`/`zstd`/
 * uncompressed encodings, multiple tilesets, external `.tsx` tilesets,
 * object/image/group layers, infinite/chunked maps, and tile flip flags
 * (the flag bits are masked off so callers see clean local tile ids).
 *
 * Pure and DOM-free apart from `atob` + `DecompressionStream`, both of
 * which are standard web platform APIs.
 */

/** Global-tile-ID flip/rotation flags occupy the top 4 bits. */
const GID_FLAG_MASK = 0x0FFFFFFF;

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

function bytesToGids(bytes: Uint8Array): Uint32Array {
  const count = bytes.byteLength >>> 2;
  const view = new DataView(bytes.buffer, bytes.byteOffset, count * 4);
  const gids = new Uint32Array(count);
  for (let i = 0; i < count; i++)
    gids[i] = view.getUint32(i * 4, true) & GID_FLAG_MASK;
  return gids;
}

function parseTileset(xml: string): TmxTileset {
  const tags = [...xml.matchAll(/<tileset\b[^>]*>/g)];
  if (tags.length === 0)
    throw new Error('tmx: no <tileset> element found');
  if (tags.length > 1)
    throw new Error('tmx: multiple tilesets are not supported');
  const tilesetTag = tags[0]![0];
  if (readAttr(tilesetTag, 'source') !== undefined)
    throw new Error('tmx: external .tsx tilesets are not supported');

  const imageMatch = xml.match(/<image\b[^>]*>/);
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
    firstgid: readNumberAttr(tilesetTag, 'firstgid', '<tileset>'),
    imageHeight,
    imageSource,
    imageWidth,
    margin,
    spacing,
    tileHeight,
    tileWidth,
  };
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
  if (encoding !== 'base64')
    throw new Error(`tmx: layer '${name}' uses unsupported encoding '${encoding ?? '(none)'}' (only base64)`);
  const compression = readAttr(dataAttrs!, 'compression');
  if (compression !== 'zlib')
    throw new Error(`tmx: layer '${name}' uses unsupported compression '${compression ?? '(none)'}' (only zlib)`);

  const gids = bytesToGids(await inflateZlib(base64ToBytes(payload!)));
  return { name, gids, height, width };
}

/**
 * Parses a TMX document into grid metrics, a single tileset, and ordered
 * tile layers. Async because layer payloads are inflated via
 * `DecompressionStream`.
 *
 * @param xml Raw `.tmx` document text.
 * @throws When the map uses an unsupported feature (see module scope).
 */
export async function parseTmx(xml: string): Promise<TmxMap> {
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

  const tileset = parseTileset(xml);

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
