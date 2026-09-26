The engine is a small set of typed Entity-Component-System primitives for 2D
and 3D games and simulations. The core is domain-neutral: it knows nothing about
players, enemies or tiles. Everything genre-specific lives in an opt-in module,
each one a separate subpath import, so unused code never reaches a bundle.

## How this Manual is organised

Each guide is generated from a source `.md` file in the repository, so the guide
and the code it documents cannot drift apart. Core primitives are documented in
`src/<name>.md` beside their source and grouped under **Core**; each opt-in
module documents itself in its own `README.md` under **Modules**. A guide says
what the piece is for, when to reach for it, and how it fits the rest of the
engine.

Signature-level detail lives in the [API reference](../api/): every public
export with its full type signature and JSDoc summary.

## Installing

The engine is pre-release (`0.0.0`) and not published to npm. Consume it as a
sibling folder with a `file:` install:

```json
"dependencies": {
  "@pierre/ecs": "file:../Entity-Cornponent-System-Engine"
}
```

The package's `exports` map points straight at TypeScript sources, so a
TypeScript-aware bundler needs no build step, and each module is tree-shaken
unless it is imported.

## Start here

- Core: [World](./core/world/) ties the primitives together,
  [ComponentStore](./core/component-store/) stores components,
  [Query](./core/query/) iterates them, [Scheduler](./core/scheduler/) orders
  systems.
- Modules: [math](./modules/math/) for vectors and easing,
  [tick](./modules/tick/) for fixed timesteps,
  [spatial](./modules/spatial/) for broadphase grids,
  [render-canvas2d](./modules/render-canvas2d/) for drawing.
