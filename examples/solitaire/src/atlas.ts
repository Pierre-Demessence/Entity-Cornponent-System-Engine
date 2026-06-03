/**
 * Kenney `TextureAtlas` XML parser.
 *
 * The boardgame pack ships its spritesheets as a Starling/Kenney-style
 * XML atlas:
 *
 * ```xml
 * <TextureAtlas imagePath="sheet.png">
 *   <SubTexture name="cardHeartsK.png" x="0" y="0" width="140" height="190"/>
 *   ...
 * </TextureAtlas>
 * ```
 *
 * We parse it with `DOMParser` (the example runs only in the browser) into
 * the `{ x, y, w, h }` frame shape `TextureAtlasRegistry.add` expects.
 */

export interface AtlasFrame {
  h: number;
  w: number;
  x: number;
  y: number;
}

export function parseAtlasXml(xml: string): Record<string, AtlasFrame> {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror'))
    throw new Error('atlas: malformed TextureAtlas XML');

  const frames: Record<string, AtlasFrame> = {};
  for (const node of doc.querySelectorAll('SubTexture')) {
    const name = node.getAttribute('name');
    if (name === null)
      throw new Error('atlas: <SubTexture> missing name');
    frames[name] = {
      h: numberAttr(node, 'height'),
      w: numberAttr(node, 'width'),
      x: numberAttr(node, 'x'),
      y: numberAttr(node, 'y'),
    };
  }
  return frames;
}

function numberAttr(node: Element, attr: string): number {
  const raw = node.getAttribute(attr);
  const value = raw === null ? Number.NaN : Number(raw);
  if (!Number.isFinite(value))
    throw new Error(`atlas: <SubTexture> has non-numeric ${attr}="${raw ?? ''}"`);
  return value;
}
