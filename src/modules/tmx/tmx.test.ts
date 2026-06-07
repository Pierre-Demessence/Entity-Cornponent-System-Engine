import type { TmxTileset } from './tmx';

import { describe, expect, it } from 'vitest';

import { gidToFrame, parseTmx, TMX_FLIP_D, TMX_FLIP_H, TMX_FLIP_V } from './tmx';

async function base64ZlibLayer(gids: number[]): Promise<string> {
  const bytes = new Uint8Array(gids.length * 4);
  const view = new DataView(bytes.buffer);
  gids.forEach((gid, i) => view.setUint32(i * 4, gid >>> 0, true));
  const source: ReadableStream<BufferSource> = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const compressed = new Uint8Array(
    await new Response(
      source.pipeThrough(new CompressionStream('deflate')),
    ).arrayBuffer(),
  );
  let binary = '';
  for (const byte of compressed)
    binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function buildTmx(
  gidsByLayer: number[][],
  options: { width?: number; height?: number } = {},
): Promise<string> {
  const width = options.width ?? 2;
  const height = options.height ?? 2;
  const layers = await Promise.all(
    gidsByLayer.map(async (gids, i) => `
      <layer id="${i + 1}" name="layer${i}" width="${width}" height="${height}">
        <data encoding="base64" compression="zlib">${await base64ZlibLayer(gids)}</data>
      </layer>`),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
    <map version="1.10" orientation="orthogonal" width="${width}" height="${height}" tilewidth="16" tileheight="16">
      <tileset firstgid="1" name="sheet" tilewidth="16" tileheight="16" spacing="1" margin="2" columns="3">
        <image source="sheet.png" width="53" height="53"/>
      </tileset>
      ${layers.join('\n')}
    </map>`;
}

describe('parseTmx', () => {
  it('parses map metrics, tileset, and zlib+base64 layer data', async () => {
    const xml = await buildTmx([[1, 2, 3, 4]]);
    const map = await parseTmx(xml);

    expect(map.width).toBe(2);
    expect(map.height).toBe(2);
    expect(map.tileWidth).toBe(16);
    expect(map.tileHeight).toBe(16);
    expect(map.tilesets).toHaveLength(1);
    expect(map.tilesets[0]!.firstgid).toBe(1);
    expect(map.tilesets[0]!.columns).toBe(3);
    expect(map.tilesets[0]!.spacing).toBe(1);
    expect(map.tilesets[0]!.margin).toBe(2);
    expect(map.tilesets[0]!.imageSource).toBe('sheet.png');
    expect(map.layers).toHaveLength(1);
    expect([...map.layers[0]!.gids]).toEqual([1, 2, 3, 4]);
  });

  it('preserves layer order (bottom-most first)', async () => {
    const xml = await buildTmx([[1, 0, 0, 0], [0, 0, 0, 5]]);
    const map = await parseTmx(xml);
    expect(map.layers.map(l => l.name)).toEqual(['layer0', 'layer1']);
    expect([...map.layers[1]!.gids]).toEqual([0, 0, 0, 5]);
  });

  it('masks the top 4 flip/rotation flag bits off each gid', async () => {
    const flipped = (0x80000000 | 0x40000000 | 7) >>> 0;
    const xml = await buildTmx([[flipped, 0, 0, 0]]);
    const map = await parseTmx(xml);
    expect(map.layers[0]!.gids[0]).toBe(7);
  });

  it('exposes per-tile flip flags parallel to the gids', async () => {
    const h = (0x80000000 | 7) >>> 0;
    const v = (0x40000000 | 8) >>> 0;
    const d = (0x20000000 | 9) >>> 0;
    const all = (0x80000000 | 0x40000000 | 0x20000000 | 10) >>> 0;
    const xml = await buildTmx([[h, v, d, all]]);
    const map = await parseTmx(xml);
    expect([...map.layers[0]!.gids]).toEqual([7, 8, 9, 10]);
    expect([...map.layers[0]!.flags]).toEqual([
      TMX_FLIP_H,
      TMX_FLIP_V,
      TMX_FLIP_D,
      TMX_FLIP_H | TMX_FLIP_V | TMX_FLIP_D,
    ]);
  });

  it('derives tileset columns when not declared', async () => {
    const xml = (await buildTmx([[1]], { height: 1, width: 1 }))
      .replace(' columns="3"', '');
    const map = await parseTmx(xml);
    // (53 - 2 + 1) / (16 + 1) = 52/17 = 3.05 → floor 3
    expect(map.tilesets[0]!.columns).toBe(3);
  });

  it('throws on a non-orthogonal map', async () => {
    const xml = (await buildTmx([[1]])).replace('orthogonal', 'isometric');
    await expect(parseTmx(xml)).rejects.toThrow(/orthogonal/);
  });

  it('throws on an infinite map', async () => {
    const xml = (await buildTmx([[1]])).replace('<map ', '<map infinite="1" ');
    await expect(parseTmx(xml)).rejects.toThrow(/infinite/);
  });

  it('parses object groups with objects of various shapes', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <map version="1.10" orientation="orthogonal" width="10" height="10" tilewidth="16" tileheight="16">
        <tileset firstgid="1" name="sheet" tilewidth="16" tileheight="16">
          <image source="sheet.png" width="16" height="16"/>
        </tileset>
        <objectgroup id="1" name="spawns" draworder="topdown">
          <object id="1" name="player" x="100" y="200" width="32" height="32"/>
          <object id="2" x="50" y="60">
            <ellipse/>
          </object>
          <object id="3" x="10" y="20">
            <point/>
          </object>
          <object id="4" x="0" y="0">
            <polygon points="0,0 16,0 8,16"/>
          </object>
          <object id="5" x="0" y="0">
            <polyline points="0,0 32,0 32,32"/>
          </object>
          <object id="6" gid="5" x="300" y="400" width="16" height="16"/>
          <object id="7" name="label" x="100" y="50" width="200" height="30">
            <text fontfamily="serif" pixelsize="14" bold="1" color="#ff0000" halign="center">Hello World</text>
          </object>
        </objectgroup>
      </map>`;
    const map = await parseTmx(xml);
    expect(map.objectGroups).toHaveLength(1);
    const og = map.objectGroups[0]!;
    expect(og.name).toBe('spawns');
    expect(og.draworder).toBe('topdown');
    expect(og.objects).toHaveLength(7);

    const [player, ellipse, point, polygon, polyline, tile, text] = og.objects;
    expect(player!.name).toBe('player');
    expect(player!.width).toBe(32);

    expect(ellipse!.ellipse).toBe(true);

    expect(point!.width).toBe(0);
    expect(point!.height).toBe(0);

    expect(polygon!.polygon).toEqual([{ x: 0, y: 0 }, { x: 16, y: 0 }, { x: 8, y: 16 }]);
    expect(polyline!.polyline).toEqual([{ x: 0, y: 0 }, { x: 32, y: 0 }, { x: 32, y: 32 }]);

    expect(tile!.gid).toBe(5);

    expect(text!.text).toBeDefined();
    expect(text!.text!.fontfamily).toBe('serif');
    expect(text!.text!.text).toBe('Hello World');
    expect(text!.text!.bold).toBe(true);
  });

  it('parses custom properties on objects', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <map version="1.10" orientation="orthogonal" width="10" height="10" tilewidth="16" tileheight="16">
        <tileset firstgid="1" name="sheet" tilewidth="16" tileheight="16">
          <image source="sheet.png" width="16" height="16"/>
        </tileset>
        <objectgroup name="props">
          <object id="1" name="npc" x="100" y="200">
            <properties>
              <property name="dialogue" value="Greetings, traveler."/>
              <property name="hostile" type="bool" value="true"/>
              <property name="level" type="int" value="5"/>
            </properties>
          </object>
        </objectgroup>
      </map>`;
    const map = await parseTmx(xml);
    const obj = map.objectGroups[0]!.objects[0]!;
    expect(obj.properties).toBeDefined();
    expect(obj.properties!.dialogue!.value).toBe('Greetings, traveler.');
    expect(obj.properties!.hostile!.value).toBe('true');
    expect(obj.properties!.hostile!.type).toBe('bool');
    expect(obj.properties!.level!.value).toBe('5');
    expect(obj.properties!.level!.type).toBe('int');
  });

  it('parses multiple tilesets', async () => {
    const xml = (await buildTmx([[1]])).replace(
      '</tileset>',
      '</tileset>\n<tileset firstgid="99" name="extra" tilewidth="16" tileheight="16"><image source="b.png" width="16" height="16"/></tileset>',
    );
    const map = await parseTmx(xml);
    expect(map.tilesets).toHaveLength(2);
    expect(map.tilesets[1]!.firstgid).toBe(99);
    expect(map.tilesets[1]!.name).toBe('extra');
  });

  it('throws when an external .tsx tileset is referenced but not provided', async () => {
    const xml = (await buildTmx([[1]])).replace(
      '<tileset firstgid="1"',
      '<tileset firstgid="1" source="ext.tsx"',
    );
    await expect(parseTmx(xml)).rejects.toThrow(/not provided/);
  });

  it('resolves an external .tsx tileset supplied via options', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <map version="1.10" orientation="orthogonal" width="2" height="2" tilewidth="16" tileheight="16">
        <tileset firstgid="5" source="ext.tsx"/>
        <layer id="1" name="layer0" width="2" height="2">
          <data encoding="csv">5,6,7,8</data>
        </layer>
      </map>`;
    const tsx = `<?xml version="1.0" encoding="UTF-8"?>
      <tileset name="sheet" tilewidth="16" tileheight="16" spacing="1" columns="3" tilecount="9">
        <image source="sheet.png" width="50" height="50"/>
      </tileset>`;
    const map = await parseTmx(xml, { tilesets: { 'ext.tsx': tsx } });
    expect(map.tilesets[0]!.firstgid).toBe(5);
    expect(map.tilesets[0]!.columns).toBe(3);
    expect(map.tilesets[0]!.spacing).toBe(1);
    expect(map.tilesets[0]!.imageSource).toBe('sheet.png');
    expect([...map.layers[0]!.gids]).toEqual([5, 6, 7, 8]);
  });

  it('parses a csv-encoded layer', async () => {
    const xml = (await buildTmx([[1]]))
      .replace(/<data[^>]*>[\s\S]*?<\/data>/, '<data encoding="csv">1,2,\n3,4\n</data>');
    const map = await parseTmx(xml);
    expect([...map.layers[0]!.gids]).toEqual([1, 2, 3, 4]);
  });

  it('throws on a non-numeric csv gid', async () => {
    const xml = (await buildTmx([[1]]))
      .replace(/<data[^>]*>[\s\S]*?<\/data>/, '<data encoding="csv">1,nope,3,4</data>');
    await expect(parseTmx(xml)).rejects.toThrow(/non-numeric csv gid/);
  });

  it('throws on a non-base64 layer encoding', async () => {
    const xml = (await buildTmx([[1]])).replace('encoding="base64"', 'encoding="xml"');
    await expect(parseTmx(xml)).rejects.toThrow(/encoding/);
  });

  it('supports gzip layer compression', async () => {
    // Build raw bytes, compress with gzip, base64-encode
    const gids = [1, 0, 0, 0];
    const bytes = new Uint8Array(gids.length * 4);
    const view = new DataView(bytes.buffer);
    gids.forEach((gid, i) => view.setUint32(i * 4, gid >>> 0, true));
    const source = new ReadableStream<BufferSource>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    const compressed = new Uint8Array(
      await new Response(source.pipeThrough(new CompressionStream('gzip'))).arrayBuffer(),
    );
    let binary = '';
    for (const byte of compressed) binary += String.fromCharCode(byte);
    const b64 = btoa(binary);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <map version="1.10" orientation="orthogonal" width="2" height="2" tilewidth="16" tileheight="16">
        <tileset firstgid="1" name="sheet" tilewidth="16" tileheight="16">
          <image source="sheet.png" width="16" height="16"/>
        </tileset>
        <layer id="1" name="l" width="2" height="2">
          <data encoding="base64" compression="gzip">${b64}</data>
        </layer>
      </map>`;
    const map = await parseTmx(xml);
    expect([...map.layers[0]!.gids]).toEqual([1, 0, 0, 0]);
  });

  it('throws on an unsupported layer compression', async () => {
    const xml = (await buildTmx([[1]])).replace('compression="zlib"', 'compression="zstd"');
    await expect(parseTmx(xml)).rejects.toThrow(/compression/);
  });
});

describe('gidToFrame', () => {
  const tileset: TmxTileset = {
    columns: 3,
    firstgid: 1,
    imageHeight: 53,
    imageSource: 'sheet.png',
    imageWidth: 53,
    margin: 2,
    spacing: 1,
    tileHeight: 16,
    tileWidth: 16,
  };

  it('maps the first tile to the top-left rect (accounting for margin)', () => {
    expect(gidToFrame(1, tileset)).toEqual({ h: 16, w: 16, x: 2, y: 2 });
  });

  it('advances by tileWidth + spacing across a row', () => {
    expect(gidToFrame(2, tileset)).toEqual({ h: 16, w: 16, x: 2 + 17, y: 2 });
    expect(gidToFrame(3, tileset)).toEqual({ h: 16, w: 16, x: 2 + 34, y: 2 });
  });

  it('wraps to the next row after `columns` tiles', () => {
    expect(gidToFrame(4, tileset)).toEqual({ h: 16, w: 16, x: 2, y: 2 + 17 });
  });
});
