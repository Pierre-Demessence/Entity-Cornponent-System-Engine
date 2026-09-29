The engine is a small set of typed Entity-Component-System primitives for 2D
and 3D games and simulations. The core is domain-neutral: it knows nothing about
players, enemies or tiles. Everything genre-specific lives in an opt-in module,
each one a separate subpath import, so unused code never reaches a bundle.

## How this Manual is organised

The sidebar groups pages by what you are trying to do:

- **Getting started** — orientation: what the engine is, which module does what,
  and the example games to read.
- **Concepts** — the model every primitive shares: entities, archetypes, ticks,
  and what a structural change costs. Read these once.
- **Guides** — tasks that span several pieces, from a first drawn scene to
  saving, scene swaps and troubleshooting.
- **Core** — one page per core primitive (`world`, `query`, `scheduler`, …):
  what it is for, when to reach for it, and how it fits the rest.
- **Modules** — one page per opt-in module, in the same shape.

The Manual explains; the [API reference](../api/) lists. Reach for the reference
when you need an exact signature: every public export with its full type and
JSDoc summary.

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
- [Module index](./getting-started/module-index/) — every opt-in module, grouped
  by the task it serves.
- [Examples](../examples/) — the prototypes, playable in the page, each with what
  it was built to prove.
- [Build a moving, drawn scene](./guides/tutorial/) — seven steps from an empty
  file to something on screen.
- [Concepts](./concepts/model/) — the model in depth, and
  [the glossary](./concepts/glossary/) for its vocabulary.
- [API reference](../api/) — every export with its full type signature.
