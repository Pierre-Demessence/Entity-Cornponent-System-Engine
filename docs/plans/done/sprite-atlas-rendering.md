# Sprite + Texture-Atlas Rendering

Add sprite rendering to the Canvas2D renderer, fed by a TexturePacker /
Kenney "Generic XML" sprite-atlas parser. Driven by the SpaceShooter
prototype, which needs to draw Kenney art instead of vector shapes.

## Promotion rationale

- **Sprite primitive** — Path C (universal canon). Listed explicitly in
  [`extending-the-engine.md`](../extending-the-engine.md): present in
  Pixi, Phaser, Unity, Godot, Bevy, LÖVE with the same shape. Ships even
  with one consumer.
- **TexturePacker XML parser** — Path B (canon format, one real
  consumer). TexturePacker's "Generic XML" / Kenney sheets are a stable,
  documented format. Minimal surface: parse + a small registry.

## Design constraints

- `Renderable` must stay plain-data + serializable (it has
  `validate`/`serialize` used by the save module). So a sprite refers to
  its art **by name** (`atlas` + `frame` strings) — never holds an
  `HTMLImageElement`.
- The renderer resolves names → image + source rect through an atlas
  registry passed in the render context. The renderer defines the
  minimal `SpriteFrameSource` contract it consumes; the `texture-atlas`
  module's `TextureAtlasRegistry` satisfies it structurally (no
  cross-module import / coupling).
- The renderer's `drawEntity` early-returns when `fill`/`stroke` are both
  undefined — sprites have neither, so that guard must skip sprites.

## Subtasks

- [x] New module `src/modules/texture-atlas/`:
  - [x] `parseTexturePackerAtlas(xml)` → `{ imagePath, frames }` (pure,
        DOM-free regex parser; rejects rotated frames).
  - [x] `TextureAtlasRegistry` (atlas name → `{ image, frames }`),
        `getFrame(atlas, frame)` → `{ image, sx, sy, sw, sh }`.
  - [x] `index.ts` barrel.
  - [x] `texture-atlas.test.ts` (parser + registry).
  - [x] `README.md`.
- [x] `render-canvas2d/renderable.ts`: add `kind: 'sprite'` to the union
      + `validate` + `serialize` branches.
- [x] `render-canvas2d/canvas2d-renderer.ts`: add `atlases?` to
      `Canvas2DRenderContext`, define `SpriteFrameSource` /
      `ResolvedSpriteFrame`, draw sprites (anchor-aware `drawImage`),
      skip the fill/stroke early-return for sprites.
- [x] `render-canvas2d/index.ts`: export the new sprite-source types.
- [x] Renderer test: sprite anchor math + transform interaction.
- [x] Docs: module README + `docs/README.md` module mention.
- [x] Lint + typecheck + tests green.

## Out of scope (V1)

- Rotated / trimmed atlas frames (Kenney simple packs don't use them;
  parser throws on `rotated="true"` rather than mis-rendering).
- A high-level "load atlas from URL" helper — the consumer composes
  `asset-loader` (image + text) + `parseTexturePackerAtlas` itself.
