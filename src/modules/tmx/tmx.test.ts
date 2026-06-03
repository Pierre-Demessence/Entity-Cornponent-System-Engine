import type { TmxTileset } from './tmx';

import { describe, expect, it } from 'vitest';

import { gidToFrame, parseTmx } from './tmx';

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
    expect(map.tileset.firstgid).toBe(1);
    expect(map.tileset.columns).toBe(3);
    expect(map.tileset.spacing).toBe(1);
    expect(map.tileset.margin).toBe(2);
    expect(map.tileset.imageSource).toBe('sheet.png');
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

  it('derives tileset columns when not declared', async () => {
    const xml = (await buildTmx([[1]], { height: 1, width: 1 }))
      .replace(' columns="3"', '');
    const map = await parseTmx(xml);
    // (53 - 2 + 1) / (16 + 1) = 52/17 = 3.05 → floor 3
    expect(map.tileset.columns).toBe(3);
  });

  it('throws on a non-orthogonal map', async () => {
    const xml = (await buildTmx([[1]])).replace('orthogonal', 'isometric');
    await expect(parseTmx(xml)).rejects.toThrow(/orthogonal/);
  });

  it('throws on an infinite map', async () => {
    const xml = (await buildTmx([[1]])).replace('<map ', '<map infinite="1" ');
    await expect(parseTmx(xml)).rejects.toThrow(/infinite/);
  });

  it('throws on an object/image/group layer', async () => {
    const xml = (await buildTmx([[1]])).replace(
      '</map>',
      '<objectgroup name="spawns"></objectgroup>\n</map>',
    );
    await expect(parseTmx(xml)).rejects.toThrow(/objectgroup/);
  });

  it('throws on multiple tilesets', async () => {
    const xml = (await buildTmx([[1]])).replace(
      '</tileset>',
      '</tileset>\n<tileset firstgid="99" tilewidth="16" tileheight="16"><image source="b.png" width="16" height="16"/></tileset>',
    );
    await expect(parseTmx(xml)).rejects.toThrow(/multiple tilesets/);
  });

  it('throws on an external .tsx tileset', async () => {
    const xml = (await buildTmx([[1]])).replace(
      '<tileset firstgid="1"',
      '<tileset firstgid="1" source="ext.tsx"',
    );
    await expect(parseTmx(xml)).rejects.toThrow(/external .tsx/);
  });

  it('throws on a non-base64 layer encoding', async () => {
    const xml = (await buildTmx([[1]])).replace('encoding="base64"', 'encoding="csv"');
    await expect(parseTmx(xml)).rejects.toThrow(/encoding/);
  });

  it('throws on a non-zlib layer compression', async () => {
    const xml = (await buildTmx([[1]])).replace('compression="zlib"', 'compression="gzip"');
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
