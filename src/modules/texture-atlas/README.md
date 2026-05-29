# `@pierre/ecs/modules/texture-atlas`

Parse TexturePacker / Kenney "Generic XML" sprite atlases and resolve
sprite names to drawable image rectangles. Pairs with the `sprite`
renderable kind in
[`modules/render-canvas2d`](../render-canvas2d/README.md).

## `parseTexturePackerAtlas(xml)`

Pure, DOM-free parser for the common atlas XML shape Kenney ships:

```xml
<TextureAtlas imagePath="simpleSpace_sheet@2.png">
  <SubTexture name="enemy_A.png" x="400" y="256" width="96" height="96"/>
</TextureAtlas>
```

Returns `{ imagePath, frames }` where `frames` maps each `name` to a
source rectangle `{ x, y, w, h }`.

Limitations (V1): rotated and trimmed frames are not supported. A
`rotated="true"` attribute throws rather than mis-rendering.

## `TextureAtlasRegistry`

Holds one or more loaded atlases and resolves `atlas` + `frame` names to
`{ image, sx, sy, sw, sh }`:

```ts
const registry = new TextureAtlasRegistry();
registry.add('space', image, parseTexturePackerAtlas(xml).frames);
registry.getFrame('space', 'enemy_A.png');
// → { image, sx: 400, sy: 256, sw: 96, sh: 96 }
```

Pass the registry to the renderer via
`Canvas2DRenderContext.atlases`; it structurally satisfies the
renderer's `SpriteFrameSource` contract, so the two modules stay
decoupled.

## End-to-end

The consumer composes loading itself — typically with
[`modules/asset-loader`](../asset-loader/README.md):

```ts
const [image, xml] = await loader.loadMany([
  imageAsset('/sheet.png'),
  textAsset('/sheet.xml'),
]);
const registry = new TextureAtlasRegistry();
registry.add('space', image, parseTexturePackerAtlas(xml).frames);

// later, per render:
renderer.render({ atlases: registry, ctx2d, world });
```

Set a sprite renderable on an entity:

```ts
world.getStore(RenderableDef).set(id, {
  atlas: 'space',
  frame: 'enemy_A.png',
  kind: 'sprite',
});
```

Import via `@pierre/ecs/modules/texture-atlas`.
