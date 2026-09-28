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

Pages that are not about a single primitive live in `website/manual/` and publish
under the same path, so a page that spans several primitives is committed beside
the generator rather than placed among its output. Three groups hold them:
**Getting started** for orientation and browsing, **Concepts** for the model the
primitives share, and **Guides** for tasks that span modules.

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

## Where to go

- [Introduction](./getting-started/introduction/) — the engine in brief, and the
  model in thirty seconds.
- [Module index](./getting-started/module-index/) — all 42 opt-in modules, grouped
  by the task they serve.
- [Examples](./getting-started/examples/) — 29 prototypes, each with what it was
  built to prove.
- [Build a moving, drawn scene](./guides/tutorial/) — seven steps from an empty
  file to something on screen.
- [Concepts](./concepts/model/) — the model in depth, and
  [the glossary](./concepts/glossary/) for its vocabulary.
- [API reference](../api/) — every export with its full type signature.
