# Non-goals

Decisions **not** to build, recorded so a later "should we build X?" has an
answer instead of a re-litigation. Absence is not self-documenting: a
missing `modules/ui` reads as "forgotten", not "refused".

Two kinds live here, both terminal — neither is a backlog candidate:

- **Declined** — considered and rejected.
- **Superseded** — the problem got solved a different way, so the sketched
  solution is off the table. Distinct from the backlog's
  `ready` / `deferred` / `speculative`: those are still wanted, this is not.

Shipped work does **not** belong here (or in the backlog) — it is described
by `src/`, dated by `git log`, and explained by its `plans/done/` plan or
module README.

## Declined

### Faster columnar view construction (prototype-accessor flyweight) — declined

The columnar store's `get(id)` returns a write-through view built with
`Object.defineProperties` once per entity and cached until the row is deleted,
so `world.query` / `get()` iteration over columnar components runs on par with
the object store. Making view *construction* cheaper is declined: a shared
prototype with column-backed accessors is **not own-enumerable**, so it
silently breaks `{ ...view }` spread and `Object.keys(view)`, both of which
consumers rely on; codegen'd own-accessor objects via `new Function` cost
complexity and CSP-friendliness for a one-time-per-entity saving. Hot loops
that need zero-alloc use the `column()` / `slotOf()` fast path instead.

### Entity hierarchy / parenting — full transform propagation — declined

Bevy-style `Parent(Entity)` / `Children` with recursive N-level transform
propagation is declined: it bakes dirty tracking, cyclic-reference guards,
and lifetime-cascade rules into every game whether or not it uses them. The
lightweight follow/carrier slice covers the observed demand and ships as
`modules/attach`. Revisit only if a prototype genuinely needs deep parent
chains.

### Scoring / lives / game-over scaffold — declined

Content, not engine. Each game's scoring rules, life count, and game-over
semantics differ and belong in app state; the primitives they need already
ship (`EventBus` for score events, `modules/save` for high scores). No
reusable shape to extract.

### Visual editor / inspector as part of the engine — declined

This is a code-first engine. A dev-mode inspector panel belongs in
`modules/debug` (scope: diagnose, not author); persistent authoring lives in
content files plus code, per the content-registration pattern. A Unity- or
Godot-style editor is not engine surface here.

### Generic asset pipeline / build plugin — declined

Vite covers the current scale. If a game ships large asset volumes, point
the build at an external tool (TexturePacker, ffmpeg) from a `package.json`
script — no engine involvement.

### Kill-plane / out-of-bounds respawn helper — declined

Content, not engine. portal and doom each check `y < RESPAWN_Y` and respawn
in the tick runner's `onBeforeFlush` — a one-liner over shipped primitives
(`transform` plus `queueDestroy`). Recorded from the gap ledger's kill-plane
row so the tally stops accumulating.

### Pickup / collectible-on-overlap — declined

Composes from shipped primitives, and one consumer already proves it:
platformer's pickup is `makeTriggerSystem` with an `onOverlap` callback that
emits a `CoinCollected` event@`examples/platformer/src/systems/pickup.ts:20`.
doom hand-rolls the same overlap → apply → despawn flow. The remaining work
is an **adoption** follow-up (migrate doom onto `makeTriggerSystem`), not a
module.

### Content hot-reload as engine surface — declined

HMR content reloading — `import.meta.hot.accept()` re-registering a mutable
content registry so live edits to entity/item templates skip a page refresh —
is consumer-side Vite wiring, not engine surface: there is no engine primitive
under it. A game that wants it keeps a small app-side registry and calls
`import.meta.hot` in its own Vite build. Revisit only if a reusable shape
emerges across several consumers.

### Plugin sandboxing — declined

`world.use(plugin)` runs a plugin's `build(world)` as ordinary trusted code —
there is no isolation of untrusted plugin/mod code. Sandboxing JS meaningfully
needs iframes, workers, or realms, which a library cannot impose without
dictating the host, and no major engine sandboxes plugin code (Bevy, Unity, and
Godot all run it trusted). A game that loads untrusted content isolates it at
its own boundary. Revisit only if the engine targets an untrusted-mod platform.

### Null-entity sentinel (`Entity.Null` / `PLACEHOLDER`) — declined

Bevy's `Entity::PLACEHOLDER`, Unity's `Entity.Null`, and EnTT's `entt::null`
exist because their languages lack a cheap optional. In TypeScript,
`EntityId | undefined` is the idiom — the engine's own APIs (`pileTop`,
`pileOf`, `query().first()`) already return it — and a sentinel would be a
second, weaker spelling of "no entity" that type-checks as a real id.

## Superseded

### Entity pooling via inactive rows — superseded

Core roadmap 3.2 once sketched pooling as "stores don't delete on recycle — they
mark rows inactive, and queries skip inactive entries". Generational id
recycling solved the problem instead: destroyed ids are reused behind a
generation check, which bounds the id space and the column store's sparse
pages, while the column store's swap-remove delete was already
allocation-free. Inactive rows would have added a liveness check to every
query pass for no remaining gain. See
[`../plans/done/entity-id-recycling.md`](../plans/done/entity-id-recycling.md).

### `modules/motion` — boundary inset / per-entity size — superseded

The size- and margin-aware clampers that motivated an `inset` /
`halfExtentOf` option on `VelocityIntegrationBoundary` now clamp directly
with `modules/math`'s `clamp` (`clamp(value, half, width − half)`). An
option on `boundary` would express nothing `clamp` does not, so the
extension is off the table rather than deferred. The shipped `clamp` mode
(`integrateBoundary`@`src/modules/motion/motion.ts:51`) keeps pinning the
origin to `[0, width] × [0, height]`, which the full-playfield clampers
adopt as-is.
