# Prototype Games Roadmap

Companion to [ecs-module-backlog.md](ecs-module-backlog.md) and
[core-engine-roadmap.md](core-engine-roadmap.md). Those documents
describe the *target* engine surface (core internals + modules); this
one describes the *proof* — a ladder of tiny games, each breaking one
more assumption baked into the current roguelike, used to validate that
`@pierre/ecs` really is domain-neutral.

## Status

Rungs 1–8 landed. Remaining rung (9 networked pong) is backlog — pick
from coverage gaps as real needs surface rather than working through
them linearly. See
[`examples/README.md`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/examples/README.md)
for the example folders, and the
[engine gap ledger](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/docs/roadmap/engine-gap-ledger.md)
for the gaps they surfaced.

---

## Guiding Rules

These apply to **every** prototype on the ladder. Without them, prototypes
become forks and teach nothing.

## R1. `@pierre/ecs` must stay byte-identical

A prototype imports the engine **unchanged**. If the prototype needs an
engine change, stop the prototype, land the engine change through the
normal plan/review loop, then resume. This is the whole point — it's the
only honest test of "is the core reusable?".

## R2. Prototypes live inside the ECS package

Prototypes live in `examples/<name>/`, each with its own
minimal `package.json` that depends on the parent `@pierre/ecs` package.
No shared `src/` with the roguelike. No shared content. No shared
renderer.

The folder already exists as a stub —
see [examples/README.md](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/examples/README.md)
for the layout, rules, and the npm-workspaces prerequisite.

Why inside `` rather than a sibling `prototypes/` folder:

- Examples ship with the engine if it is ever released publicly (see
  [ecs-engine-public-release-strategy.md](ecs-engine-public-release-strategy.md)).
- Forces every example to be consumable through the *same* import path
  external users would use (`@pierre/ecs`, not a relative path into
  `../../src`). Catches packaging mistakes early.
- Keeps the engine's test surface self-contained: `npm test -w @pierre/ecs`
  can cover both unit tests and example smoke-builds.

## R3. Scope: one screen, one mechanic

Prototypes are not games. No menus, no save system, no audio, no polish.
A single HTML page, one canvas, one input source, one mechanic proven.
Target: < 500 lines of app code per prototype.

## R4. Each prototype must break at least one engine assumption

If a prototype uses the same tick model, the same spatial structure, and
the same renderer as the roguelike, it proves nothing. The ladder below is
ordered by *how many* assumptions each step breaks.

## R5. Write a one-page postmortem

After each prototype: what engine API was missing, what was awkward, what
was surprising. The postmortem feeds back into
[ecs-module-backlog.md](ecs-module-backlog.md) and
[core-engine-roadmap.md](core-engine-roadmap.md), where shape-validated
proposals are tracked through the promotion rule-book in
[../extending-the-engine.md](../extending-the-engine.md).

---

## Prototype Template

When the first prototype is actually built, copy this skeleton rather than
inventing a new layout. Consistency across examples matters more than any
individual example's cleverness — future-me (or a public-repo visitor)
should be able to `cd` into any example folder and know exactly what's
there.

## Prerequisite: npm workspaces

The repo root `package.json` needs a `"workspaces"` field before any
example can reference `@pierre/ecs` by name. Add this once, with the first
example:

```jsonc
// root package.json
{
  "workspaces": [
    "packages/*",
    "examples/*"
  ]
}
```

## Folder skeleton

```
examples/<name>/
├── package.json         # standardized scripts + @pierre/ecs dep
├── index.html           # single <canvas> or <div id="root">
├── vite.config.ts       # copy verbatim from the first example
├── tsconfig.json        # extends the repo root's tsconfig
├── src/
│   ├── main.ts          # exports start(container: HTMLElement): () => void
│   └── components.ts    # example-local components (no cross-example imports)
└── POSTMORTEM.md        # written after the example works
```

## `package.json` shape

```jsonc
{
  "name": "@pierre/ecs-example-<name>",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@pierre/ecs": "*"
  },
  "devDependencies": {
    "typescript": "~5.9.3",
    "vite": "^8.0.3"
  }
}
```

Notes:

- `"@pierre/ecs": "*"` resolves via npm workspaces — no version bump
  needed when the engine changes.
- No `preact`, no `@preact/signals`, no project dependencies. Examples
  render with raw DOM / canvas / three.js only.
- No test scripts. Examples are validated by "does it run?" and the
  postmortem, not by unit tests. Engine regressions are caught in the
  engine's own tests.

## Entry point convention

Every example's `src/main.ts` exports **one function**:

```ts
export function start(container: HTMLElement): () => void {
  // 1. Create world, register components, wire systems
  // 2. Attach canvas / DOM to container
  // 3. Kick off tick loop
  // 4. Return a teardown function that tears everything down cleanly
}
```

Why: a future "examples gallery" page can load any example by calling
`start(div)` and later `teardown()` when the user switches examples. It
also forces each example to be resource-hygienic, which catches engine
lifecycle bugs (did `World` actually release its listeners? did the tick
loop stop?).

The matching `index.html` is trivial:

```html
<!doctype html>
<html>
  <body style="margin:0">
    <div id="root" style="width:100vw;height:100vh"></div>
    <script type="module">
      import { start } from './src/main.ts';
      const teardown = start(document.getElementById('root'));
      window.addEventListener('beforeunload', teardown);
    </script>
  </body>
</html>
```

## CI

Each example adds one line to the root CI job: `npm run build -w
@pierre/ecs-example-<name>`. If the build passes, the example still
compiles against the current engine. That's the whole CI contract — no
unit tests, no visual regression, no E2E. The examples are guard-rails
against engine regressions, not products.

## What *not* to include

- No shared utility folder (`examples/_shared/`). If two examples want
  the same helper, it belongs in the engine.
- No linting config per example. They inherit the root ESLint config.
- No `.env`, no secrets, no network access in examples (Rung 9 networked
  pong is the only exception and uses WebRTC peer-to-peer).
- No assets beyond tiny procedural ones. Don't commit PNGs.

---

## The Ladder

Ordered by increasing coverage. Each prototype breaks a superset of the
previous one's assumptions. **Stop at any rung** the engine has passed —
no need to do them all, and no need to do them in one go.

## Rung 0 — Current state (roguelike)

**Assumptions baked in:** turn-based (discrete, player-triggered), integer
grid, hash-grid spatial, 2D canvas (tile + ASCII backends), keyboard +
mouse input (click-to-move, right-click context menu), single-player,
local save.

Every prototype below breaks at least one of these.

---

## Rung 1 — **Snake**

| | |
|---|---|
| **Genre** | Arcade grid |
| **Canvas** | 2D canvas |
| **Controls** | Keyboard (4-way) |
| **Mechanic** | Grow on food pickup, die on self-collision |
| **Assumptions broken** | **Tick model**: variable-rate rendering interpolates a fixed-rate game tick. First test of `TickSource` abstraction (M2 in the general-purpose roadmap). |
| **Assumptions kept** | Integer grid, hash-grid spatial, 2D canvas, keyboard input (mouse not needed). |
| **Exercises modules** | M2 (Time), M3 (Input), M4 (Render). |
| **Why this rung first** | Closest thing to the roguelike — forces the Smallest Possible Change. If the engine can't do Snake without edits, nothing else will work. |
| **Expected engine gaps** | `TickSource` interface (currently `turnNumber` is implicit in `Game`). Clean decoupling of "world tick" from "render frame". |
| **Target LOC** | ~300 lines. |

---

## Rung 2 — **Asteroids**

| | |
|---|---|
| **Genre** | Arcade vector shooter |
| **Canvas** | 2D canvas |
| **Controls** | Keyboard (rotate/thrust/fire) |
| **Mechanic** | Inertia-based ship, wrap-around space, split asteroids on bullet hit |
| **Assumptions broken** | **Spatial**: continuous 2D coordinates (`number`, not `int`), not a grid. **Tick**: fixed-rate physics + variable render. **Collision**: circle-vs-circle, not tile occupancy. |
| **Assumptions kept** | 2D only, keyboard input, single-player. |
| **Exercises modules** | M1 (Spatial, non-grid variant), M2 (Time, fixed-tick), M3 (Input), M4 (Render), hint of M7 (Physics — kinematic only, no constraints). |
| **Why this rung** | First real non-grid test. `HashGrid2D<{x,y: number}>` with cell-size becomes the new default. Bullet-vs-asteroid queries must be fast. |
| **Expected engine gaps** | Generalized `SpatialStructure<TPos>` interface. A proper fixed-step `TickSource`. Entity lifecycle events (A3) for spawn-on-split. |
| **Target LOC** | ~500 lines. |

---

## Rung 3 — **Platformer sandbox** ("cube on platforms with coins")

| | |
|---|---|
| **Genre** | Side-scroller physics demo (not a full game) |
| **Canvas** | 2D canvas |
| **Controls** | Keyboard (left/right/jump) |
| **Mechanic** | Gravity, AABB collision resolution against static platforms, coin pickup |
| **Assumptions broken** | **Physics**: gravity + collision response, not just detection. **Spatial**: AABB broadphase, not point queries. **Entities**: static + dynamic distinction matters. |
| **Assumptions kept** | 2D only, keyboard input, single-player, single screen. |
| **Exercises modules** | M1 (Spatial, AABB), M2 (Time), M3 (Input), M4 (Render), **M7 (Physics — first real use)**. |
| **Why this rung** | Forces a minimal physics module — even a toy AABB solver — and proves the engine can host it. Most expensive pre-3D rung; also the most revealing. |
| **Expected engine gaps** | `SpatialStructure` for AABBs (sweep-and-prune or uniform grid with extents). A physics step hook separate from the logic step. Component read/write declarations (A5) start paying off here. |
| **Target LOC** | ~800 lines. |

---

## Rung 4 — **Top-down shooter** ("twin-stick arena")

| | |
|---|---|
| **Genre** | Real-time top-down action |
| **Canvas** | 2D canvas |
| **Controls** | Keyboard + mouse OR gamepad (twin-stick) |
| **Mechanic** | WASD movement + mouse-aim shooting, waves of enemies with simple steering AI |
| **Assumptions broken** | **Input**: continuous aim via mouse *position* (not discrete clicks like the roguelike) or gamepad analog stick — requires per-frame input polling rather than discrete event handling. **AI**: continuous steering, not turn-based decisions. **Scale**: hundreds of entities (bullets, enemies) — first real perf test. |
| **Assumptions kept** | 2D, single screen, single player. |
| **Exercises modules** | M1 (Spatial, continuous 2D at scale), M2 (Time), M3 (Input — multi-source), M4 (Render — batched), M8 (AI — steering). |
| **Why this rung** | First prototype that stresses *scale* and *input abstraction* simultaneously. Gamepad support forces M3 to be a real interface, not a keyboard adapter. |
| **Expected engine gaps** | Input-action abstraction (keybinding registry, roadmap 4.5). Archetype cache (roadmap 3.1) earns its keep here. Object pooling (roadmap 3.2) for bullets. |
| **Target LOC** | ~1000 lines. |

---

## Rung 5 — **Card battler** ("state machine + async input")

| | |
|---|---|
| **Genre** | Turn-based card game (Slay-the-Spire-lite) |
| **Canvas** | DOM (HTML elements, not canvas) |
| **Controls** | Mouse (click + drag) |
| **Mechanic** | Hand of cards, drag-to-play, one enemy, simple damage/block |
| **Assumptions broken** | **Renderer**: DOM, not canvas. **Input**: pointer events, drag-and-drop. **Tick**: event-driven, not time-driven (waits for player). **Data**: strong component-as-data focus (deck, discard, hand, effects). |
| **Assumptions kept** | Turn-based, 2D, single player. |
| **Exercises modules** | M3 (Input — pointer), M4 (Render — DOM adapter), M5 (Serialization — deck state). |
| **Why this rung** | Proves the renderer interface isn't secretly coupled to pixel buffers. Proves the tick model handles "wait for input forever" cleanly. |
| **Expected engine gaps** | Generic `Renderer` interface with DOM as a backend. Entity lifecycle events (A3) driving DOM diffing. |
| **Target LOC** | ~600 lines. |

---

## Rung 6 — **Rhythm game** ("timing-critical audio")

| | |
|---|---|
| **Genre** | Music/rhythm |
| **Canvas** | 2D canvas |
| **Controls** | Keyboard (4 lanes) |
| **Mechanic** | Notes scroll down lanes, press on beat, score timing accuracy |
| **Assumptions broken** | **Time source**: Web Audio `AudioContext.currentTime` drives the tick, not `performance.now()`. First case where the tick clock is *external*. |
| **Assumptions kept** | 2D, keyboard, single player. |
| **Exercises modules** | M2 (Time — external clock source), M3 (Input — low-latency), potential M_Audio. |
| **Why this rung** | Stresses the `TickSource` abstraction: can it accept a clock we don't own? This is a hard requirement for networked games later (M9). |
| **Expected engine gaps** | `TickSource` that exposes "current time" as a function, not a counter. Input events timestamped to the same clock. |
| **Target LOC** | ~500 lines. |

---

## Rung 7 — **3D platformer** ("cube in a box with coins, WebGL")

| | |
|---|---|
| **Genre** | 3D platformer sandbox (again, not a game) |
| **Canvas** | WebGL via three.js |
| **Controls** | Keyboard (WASD) + mouse (camera) |
| **Mechanic** | Gravity, AABB-vs-AABB collision, camera follows cube, collect coins |
| **Assumptions broken** | **Spatial**: 3D (octree or 3D hash-grid). **Renderer**: GPU-accelerated, scene-graph-based (three.js). **Coordinates**: `{x, y, z}` everywhere. |
| **Assumptions kept** | Single player, single screen. |
| **Exercises modules** | M1 (Spatial — 3D), M2 (Time — fixed-tick), M3 (Input — mouse look), M4 (Render — three.js adapter), M7 (Physics — 3D AABB). |
| **Why this rung** | The defining test: if `@pierre/ecs` survives 3D, it survives anything we're likely to attempt. Forces `SpatialStructure<TPos>` to be fully generic in `TPos` (not `{x,y}`-shaped). |
| **Expected engine gaps** | Any remaining 2D-ness in interfaces. Scene-graph-vs-ECS reconciliation (three.js has its own hierarchy — where's the source of truth?). |
| **Target LOC** | ~1200 lines. |
| **Tech** | [three.js](https://threejs.org) (stable, mature, well-typed). |

---

## Rung 8 — **Local multiplayer pong** ("split-screen / hotseat")

| | |
|---|---|
| **Genre** | Multiplayer arcade |
| **Canvas** | 2D canvas |
| **Controls** | Two keyboard halves (WS + arrows) OR two gamepads |
| **Mechanic** | Two paddles, one ball, score to 11 |
| **Assumptions broken** | **Input**: multiple player-scoped input sources with identity. **Game state**: score as a resource, not per-entity. |
| **Assumptions kept** | 2D, same-screen, no networking. |
| **Exercises modules** | M3 (Input — player-scoped), minor M4. |
| **Why this rung** | Cheap but forces input abstraction to carry *player identity*, which is the stepping stone to networking (M9) later. |
| **Target LOC** | ~300 lines. |

---

## Rung 9 — **Networked pong** ("lockstep over WebRTC")

| | |
|---|---|
| **Genre** | Multiplayer arcade (networked) |
| **Canvas** | 2D canvas |
| **Controls** | Keyboard |
| **Mechanic** | Two browser tabs, one is host, deterministic lockstep over WebRTC data channel |
| **Assumptions broken** | **Determinism**: the engine must produce identical state given identical input + initial state. **Tick**: remote inputs buffered and applied on the matching tick. **Lifecycle events**: serialized and replayed (A3 earns its keep). |
| **Exercises modules** | M2 (Time — networked tick), M3 (Input — network source), M5 (Serialization — for state hashing), M9 (Networking — first real use). |
| **Why this rung** | The "if this works, anything works" rung for engine correctness. Non-determinism surfaces instantly. |
| **Target LOC** | ~1500 lines including transport. |
| **Status** | **Speculative** — only attempt if all previous rungs passed cleanly. |

---

## Coverage Matrix

| Prototype | M1 Spatial | M2 Time | M3 Input | M4 Render | M5 Save | M7 Physics | M8 AI | M9 Net | WebGL |
|---|---|---|---|---|---|---|---|---|---|
| Snake | grid | variable+fixed | kbd | canvas | — | — | — | — | — |
| Asteroids | continuous 2D | fixed | kbd | canvas | — | kinematic | — | — | — |
| Platformer | AABB 2D | fixed | kbd | canvas | — | **AABB+gravity** | — | — | — |
| Top-down shooter | continuous 2D ×N | fixed | **kbd+mouse/gamepad** | canvas batched | — | circle | steering | — | — |
| Card battler | — | event-driven | pointer | **DOM** | deck state | — | scripted | — | — |
| Rhythm | — | **audio clock** | kbd (low-latency) | canvas | — | — | — | — | — |
| 3D platformer | **3D grid/octree** | fixed | kbd+mouse | **three.js** | — | **3D AABB** | — | — | ✅ |
| Local pong | — | fixed | **player-scoped** | canvas | — | kinematic | — | — | — |
| Networked pong | — | **networked** | **networked** | canvas | **state-hash** | kinematic | — | **lockstep** | — |

Bold = first prototype on the ladder to exercise that module/variant.

---

## Suggested Order

Not every rung is worth doing, and the order is not strictly linear.
Suggested practical path:

1. **Rung 1 (Snake)** — after engine items A1/A2/A3 land. Cheap, low-risk.
2. **Rung 2 (Asteroids)** — the real first test of non-grid spatial.
3. **Rung 7 (3D platformer)** — *skip rungs 3-6* and go straight to 3D.
   If it works, rungs 3-6 are almost certainly fine and only need doing
   if their specific module (physics, DOM, audio, twin-stick) is actually
   about to be used for something real.
4. **Rung 9 (Networked pong)** — only if/when networking becomes a real
   goal.

Rungs 3, 4, 5, 6, 8 are on the ladder for **completeness** — each has a
module it uniquely stresses — but skipping them is fine if the interfaces
they'd test are being validated by a real future game instead.

---

## Relationship to Engine Roadmap

Each prototype rung **depends on** certain audit items being done, and
**validates** others:

| Rung | Depends on (must land first) | Validates |
|---|---|---|
| Snake | A1, A2, A3 (lifecycle events), **M2 TickSource** | TickSource interface, variable-vs-fixed tick separation |
| Asteroids | Snake lessons, **M1 SpatialStructure** | Non-grid spatial, fixed-tick physics loop |
| Platformer | Asteroids lessons, minimal M7 | AABB collision, physics-as-module |
| Top-down shooter | Rung 4.5 (keybinding registry), archetype cache (3.1) | Input abstraction, perf at scale |
| Card battler | M4 Renderer interface | DOM as a renderer backend |
| Rhythm | M2 supports external clocks | Clock-agnostic tick |
| 3D platformer | M1 generic in `TPos`, M4 three.js adapter | Full dimensional independence |
| Local pong | M3 player-scoped input | Multi-player input model |
| Networked pong | All of the above + determinism guarantees | End-to-end correctness |

---

## Explicit Non-Goals

- **Finishing any of these as shippable games.** They are test harnesses.
  Polish, menus, save/load, settings screens, audio — all out of scope.
- **Building an engine "store" or "starter kit".** The prototypes exist
  in-repo for validation, not as marketing demos. Public-facing demos
  (if ever) would be a separate effort — see
  [ecs-engine-public-release-strategy.md](ecs-engine-public-release-strategy.md).
- **Graphics quality.** Programmer art only. Three.js primitives for 3D,
  filled rectangles for 2D, DOM elements for the card battler. Any time
  spent on visuals is time not spent testing the engine.

---

## Related Documents

- [ecs-module-backlog.md](ecs-module-backlog.md) — deferred / speculative
  / declined modules these prototypes either consume or unblock.
- [core-engine-roadmap.md](core-engine-roadmap.md) — core-engine
  internals. Most prototypes depend on one or more of its items.
- [../plans/done/ecs-engine-audit.md](../plans/done/ecs-engine-audit.md) — concrete
  audit items (A1-A12, B1-B10); postmortems from each prototype feed back
  here.
- [ecs-engine-public-release-strategy.md](ecs-engine-public-release-strategy.md)
  — separate question of ever open-sourcing `@pierre/ecs`.
