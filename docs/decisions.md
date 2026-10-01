# Decisions

Non-obvious decisions: what was decided, why, and what was rejected. A later
"should we build X?" or "why is it like this?" gets an answer here instead of a
re-litigation. Open work is in [backlog.md](backlog.md).

## Engine architecture

### Hybrid component storage, inferred from the schema

All-numeric components (every field `'number'` or a typed kind) are stored
columnar — typed-array columns indexed by a dense slot, with a paged sparse set
mapping ids to slots ([`src/column-store.ts`](../src/column-store.ts)). Any other
component, and any hand-written `ComponentDef` with custom
`serialize`/`deserialize`, stays an object in a `Map`. The engine picks the
layout from the schema; consumers never choose it, and there is one `PositionDef`,
not a `PositionSoADef` beside it.

- **Why two layouts:** a string or nested object cannot live in a `Float32Array`,
  so the object store remains only for components that cannot be columnized.
- **Why `get()` still returns a mutable object:** every consumer mutates
  components in place (`pos.x += vx * dt`). A columnar `get` returns a cached
  write-through view so that idiom keeps working; the fast path is the opt-in
  `column()` / `slotOf()` API.
- **Rejected:** a storage dial on the component def (duplicates definitions);
  columnar-only storage (cannot hold non-numeric data).
- **Not reached by this model:** gather-free multi-component iteration, which
  needs archetype tables (backlog: core 3.5).

### Task parallelism and data parallelism are separate tools

`modules/worker-pool` offloads whole jobs to workers by message passing
(pathfinding solves, generation, planning, decoding): the copy is small next to
the compute, it needs no cross-origin isolation, and it is the only option for
non-numeric work. Data parallelism — one operation over a large shared column —
needs `SharedArrayBuffer`-backed columns (`ColumnStore { shared: true }`) and
is proven only in `examples/parallel-kernel` (backlog: `modules/parallel`).

- **Rejected:** message-passing workers for the per-tick ECS loop — the copy
  cost dominates.

### 3D is a set of sibling modules, not a `z` on the 2D stack

3D ships as parallel modules (`transform-3d`, `motion-3d`, `collision-3d`,
`kinematics-3d`, `camera-3d`, `render-scene3d`) beside the 2D ones.

- `PositionDef` gets no `z`: it would break `HashGrid2D`, every 2D query and
  the 2D contract.
- `PositionDef` is not renamed `Position2DDef` pre-emptively; only if mixed
  2D/3D games prove the name ambiguous.
- Spatial indexing is dimension-agnostic: `SpatialStructure<TPos>` and
  `world.enableSpatial` / `world.move` are generic in the position shape, and
  `HashGrid3D` is one more backend in `modules/spatial`.

### `EntityId | undefined` instead of a null-entity sentinel

Bevy's `Entity::PLACEHOLDER`, Unity's `Entity.Null` and EnTT's `entt::null`
exist because their languages lack a cheap optional. In TypeScript,
`EntityId | undefined` is the idiom — `pileTop`, `pileOf` and `query().first()`
already return it — and a sentinel would be a second, weaker spelling of "no
entity" that type-checks as a real id.

### No 1D simplex noise

The simplex construction degenerates in 1D to a gradient noise
indistinguishable in shape from `perlin1D`, so shipping both would be two names
for one behaviour.

### Faster columnar view construction (prototype-accessor flyweight) — declined

A columnar store's `get(id)` builds a write-through view with
`Object.defineProperties` once per entity and caches it until the row is
deleted. A shared prototype with column-backed accessors would be cheaper but
**not own-enumerable**, so it silently breaks `{ ...view }` and
`Object.keys(view)`, which consumers rely on; codegen'd own accessors via
`new Function` cost complexity and CSP-friendliness for a one-time-per-entity
saving. Hot loops use the `column()` / `slotOf()` fast path instead.

### Entity hierarchy with full transform propagation — declined

Bevy-style `Parent(Entity)` / `Children` with recursive N-level transform
propagation bakes dirty tracking, cycle guards and lifetime-cascade rules into
every game whether it uses them or not. The follow/carrier slice covers the
observed demand and ships as `modules/attach`. Revisit only if a prototype needs
deep parent chains.

### Entity pooling via inactive rows — superseded

Pooling was sketched as "stores mark rows inactive on recycle, and queries skip
inactive entries". Generational id recycling solves the problem instead:
destroyed ids are reused behind a generation check, which bounds the id space
and the column store's sparse pages, and the column store's swap-remove delete
is already allocation-free. Inactive rows would add a liveness check to every
query pass for no remaining gain.

### Plugin sandboxing — declined

`world.use(plugin)` runs a plugin's `build(world)` as ordinary trusted code.
Meaningful JS sandboxing needs iframes, workers or realms, which a library
cannot impose without dictating the host, and no major engine sandboxes plugin
code (Bevy, Unity and Godot all run it trusted). A game that loads untrusted
content isolates it at its own boundary. Revisit only if the engine targets an
untrusted-mod platform.

## Engine scope

### Scoring / lives / game-over scaffold — declined

Content, not engine. Scoring rules, life counts and game-over semantics differ
per game and belong in app state; the primitives they need already ship
(`EventBus` for score events, `modules/save` for high scores).

### Visual editor / inspector as part of the engine — declined

This is a code-first engine. A dev-mode inspector belongs in `modules/debug`
(scope: diagnose, not author); persistent authoring lives in content files plus
code. A Unity- or Godot-style editor is not engine surface.

### Generic asset pipeline / build plugin — declined

Vite covers the current scale. A game with large asset volumes points its build
at an external tool (TexturePacker, ffmpeg) from a `package.json` script.

### Content hot-reload as engine surface — declined

HMR content reloading (`import.meta.hot.accept()` re-registering a mutable
content registry) is consumer-side Vite wiring with no engine primitive under it.
A game that wants it keeps a small app-side registry. Revisit only if a reusable
shape emerges across several consumers.

### Kill-plane / out-of-bounds respawn helper — declined

Content, not engine. portal and doom each check `y < RESPAWN_Y` in the tick
runner's `onBeforeFlush` — a one-liner over shipped primitives (`transform` plus
`queueDestroy`).

### Pickup / collectible-on-overlap — declined

Composes from shipped primitives: platformer's pickup is `makeTriggerSystem`
with an `onOverlap` callback that emits a `CoinCollected` event
(`examples/platformer/src/systems/pickup.ts:20`). doom's hand-rolled version is
an adoption follow-up (backlog: Examples), not a module.

### `modules/motion` boundary inset / per-entity size — superseded

Size- and margin-aware clampers use `modules/math`'s `clamp`
(`clamp(value, half, width − half)`) directly, so an `inset` / `halfExtentOf`
option on `VelocityIntegrationBoundary` would express nothing `clamp` does not.
The `clamp` boundary mode keeps pinning the origin to `[0, width] × [0, height]`.

### Pixel / tile coordinate helpers stay in app code

Converting between cells, pixels and DOM/canvas coordinates is
renderer-specific; each example keeps its own.

## Docs and site

### No per-primitive guide for 13 core sources

Core sources without a same-named guide get none, for reasons that differ per
file: `tick-source.ts` and `tick-runner.ts` are covered by `src/tick.md`;
`index.ts` is a barrel; `archetype-index.ts` and `column-store.ts` are storage
internals behind `ComponentStore` and `Query`; `entity-id.ts`, `lifecycle.ts`,
`input-source.ts`, `renderer.ts` and `audio-provider.ts` are interface contracts
of 2–26 lines; `validation.ts`, `plugin.ts` and `test-utils.ts` are small
utilities.

### `docs/**` is internal and never published

The site publishes the home page, the Manual (module READMEs, core guides,
`website/manual/**`), the API reference and the Examples. The Manual generator
drops any link into `docs/`, so governance docs can change shape without
breaking the site.

## Process

### One backlog file, one line per item

All open work — core, modules, site, example adoption, untriaged gaps — is in
[backlog.md](backlog.md), one entry each, grouped by area in sections. An entry
gets an indented note of at most three lines only when its design cannot be
re-derived from other engines' documentation (core internals, split-canon
modules). Repo-grep evidence ("ABSENT, a grep finds…") is not kept: it goes
stale and is re-checked when the item is built.

- **Rejected:** multi-paragraph entries (the module backlog reached 1,272 lines
  of mostly re-derivable detail); one file per area (the site backlog holds two
  items).

### The engine gap ledger stays a two-role inbox

Engine gaps from the examples land in the "Untriaged engine gaps" section of
the backlog, written by whoever built the example (symptom only), and are
decided in a separate triage pass. The process is in
[extending-the-engine.md](extending-the-engine.md#how-gaps-reach-the-engine).

- **Why separate roles:** the example builder's single game biases the
  abstraction; keeping the module decision out of their hands prevents one
  game's shape from becoming the engine's.
