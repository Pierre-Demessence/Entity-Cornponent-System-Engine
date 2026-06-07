# Engine Gap Analysis — 2026-06-07

Cross-reference of [engine-gap-ledger.md](roadmap/engine-gap-ledger.md),
[ecs-module-backlog.md](roadmap/ecs-module-backlog.md), and the on-disk
module tree at `src/modules/`. Identifies which gaps are genuinely still
open and ranks the most obvious next builds.

## Already shipped (present in module tree)

Despite backlog entries dated 2026-07-15 through 2026-07-18, these all
exist on disk as of 2026-06-07:

- `ContinuousHashGrid2D` (`spatial/continuous-hash-grid-2d.ts`)
- `modules/attach` (`attach/attach.ts`)
- `modules/camera` V2 (canon-complete Godot `Camera2D` parity)
- `modules/math` (scalar: `clamp`, `lerp`, `remap`, `smoothstep`, etc.)
- `modules/particles` (`burst` + `ParticleEmitterDef` + over-life curves)
- `modules/tween` + `modules/easing` (Penner curves + `Tween` value primitive)
- `modules/spawner` (cadence emitter with per-interval provider)
- `modules/cooldown` (`CooldownDef` + `makeCooldownSystem` + `ready`/`trigger`)
- `modules/timer` (Bevy-style `Timer` value primitive: once/repeating)
- `modules/rng` (`shuffle`/`pick`/`randomInt`/`makeSeededRng`)
- `modules/motion` vec utils (`normalize` + `scaleToSpeed`)
- `modules/collision` V2 reflection (`reflect` + `bounceOffAabb`)

Nothing to do for any of these — they ship and consumers adopted them.

## Open gaps (still actionable)

### Tier 1 — Obvious, trigger MET, clear canon

#### ✅ 1. `modules/tilemap` — CREATE

| | |
|---|---|
| **Trigger** | MET — 2 consumers (rpg, tilemap), both hand-roll tile→entity auto-spawn + collision-layer derivation |
| **Canon** | Unanimous — Godot `TileMap`, Unity `Tilemap`, Phaser `Tilemap` |
| **Scope** | `TilemapDef { widthTiles, heightTiles, tileW, tileH, data }` + batched renderer pass + collision-layer derivation from tile properties |
| **Blockers** | None. `modules/tmx` ships the parse half; `modules/render-canvas2d` has the `view` transform + off-screen cull. |
| **Status** | Backlog says "Ready to build; not yet scheduled." |

This is the single most obvious missing module — two authored-tile-grid
consumers hand-roll the same auto-spawn + walkability boilerplate, and
the canon is unanimous.

#### 2. `TagAdded` / `TagRemoved` lifecycle events — MODIFY core

| | |
|---|---|
| **Trigger** | 1 consumer (card-battler), but low-cost enough to ship on canon alone |
| **Scope** | Add `TagAdded` / `TagRemoved` variants to `LifecycleEvent` in `src/lifecycle.ts` + wire in `src/world.ts` |
| **Effort** | ~10 lines, zero API surface risk |
| **Workaround** | "Model zones as components" — but tags exist to avoid component overhead. |

### Tier 2 — Strong candidates, MET triggers, genre-clustered

#### 3. Card-game zone/pile helpers — CREATE

Two consumers (card-battler, solitaire) hand-roll hand↔deck↔discard and
stock↔waste tag swaps. Every digital card game engine ships zone management.
Narrow scope: `moveToZone(entity, fromTag, toTag)` + capacity guards +
ordered-pile insert/remove. Could be a pure-helper module or folded into an
existing one.

#### 4. Drag-and-drop hit-testing — CREATE (companion to #3)

Same 2 consumers, same genre. Reverse hit-test + legal-drop predicate.
Composes with the shipped `projectPointer` + `PointerProvider`. Natural
companion to zone helpers.

### Tier 3 — Correctly deferred

| Gap | Consumers | Why deferred |
|---|---|---|
| `modules/grid-movement` | 3 (snake, frogger, rpg) | No shared shape — snake body-shift vs frogger hop vs rpg free-move |
| `modules/ai` (steering) | 2 (top-down-shooter, card-battler) | Shapes diverge; rule-of-three not met |
| `modules/rhythm` | 1 (rhythm) | Genre-specific; need 2nd consumer |
| `modules/input` event-mode | 1 (roguelike) | Only 1 turn-based consumer |
| Composite `Renderable` | 1 (flappy) | 1 consumer, speculative |

## Recommendation

Build in this order:

1. **`modules/tilemap`** — closes the largest remaining 2D surface gap.
2. **`TagAdded`/`TagRemoved`** — trivial core fix, outsized impact.
3. **Card-game helpers** — zone + drag-and-drop, 2 consumers, narrow scope.
