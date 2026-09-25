The engine is a small set of typed Entity-Component-System primitives for 2D
games and simulations. The core is domain-neutral: it knows nothing about
players, enemies or tiles. Everything genre-specific lives in an opt-in module,
each one a separate subpath import, so unused code never reaches a bundle.

## How this Manual is organised

One guide per module, generated from that module's own `README.md` in the
repository, so the guide and the module documentation cannot drift apart. Each
guide says what the module is for, when to reach for it, and how it fits the
rest of the engine. The sidebar groups them under **Modules**.

Signature-level detail lives in the [API reference](../api/): every public
export with its full type signature and JSDoc summary. Core primitives have
their reference pages there rather than a guide here.

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

- Core types: [`World`](../api/world/classes/ecsworld/),
  [`ComponentStore`](../api/component-store/classes/componentstore/),
  [`Query`](../api/query/classes/querybuilder/),
  [`Scheduler`](../api/scheduler/classes/scheduler/).
- Modules: [math](./math/) for vectors and easing, [tick](./tick/) for fixed
  timesteps, [spatial](./spatial/) for broadphase grids,
  [render-canvas2d](./render-canvas2d/) for drawing.
