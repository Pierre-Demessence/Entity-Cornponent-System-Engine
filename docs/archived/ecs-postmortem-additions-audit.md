# ECS Postmortem Additions Audit

> **Archived 2026-05-07.** This was a one-shot reconciliation exercise:
> walk every example postmortem, check each suggestion against `src/`,
> keep only the missing ones. The three surviving items — `render-dom`
> V2, 3D sibling modules, and a local-multiplayer player-slot helper
> — are now tracked directly in
> [../roadmap/ecs-module-backlog.md](../roadmap/ecs-module-backlog.md).
> Future postmortem additions go straight into that backlog instead of
> a separate audit pass.

Companion to
[general-purpose-ecs-roadmap.md](general-purpose-ecs-roadmap.md) and
[../roadmap/ecs-module-backlog.md](../roadmap/ecs-module-backlog.md).

This document does one narrow job: take the additions suggested by the
example postmortems, verify them against the current ``
engine code, and keep only the items that are still missing.

## Source postmortems

This audit covers the example postmortems currently present under
`examples/`:

- [Snake](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/examples/snake/POSTMORTEM.md)
- [Asteroids](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/examples/asteroids/POSTMORTEM.md)
- [Platformer](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/examples/platformer/POSTMORTEM.md)
- [Top-Down Shooter](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/examples/top-down-shooter/POSTMORTEM.md)
- [Card Battler](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/examples/card-battler/POSTMORTEM.md)
- [Rhythm](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/examples/rhythm/POSTMORTEM.md)
- [3D Platformer](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/examples/platformer-3d/POSTMORTEM.md)
- [Local Pong](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/examples/local-pong/POSTMORTEM.md)

## Inclusion rule

- Include only additions that are **not already implemented** in
  `src/`.
- Exclude anti-goals and ideas the postmortems argued **against**.
- When an item already exists in the engine, record it once in the
  verification section below and do **not** repeat it in the backlog.

## Verified already shipped and excluded from this backlog

These items came up in the postmortems, but a source check confirmed that
they already exist in the engine today:

| Suggested addition | Verified status | Evidence |
|---|---|---|
| `EcsWorld.clearAll()` | Already shipped | [src/world.ts](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/world.ts), [docs/world.md](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/docs/world.md) |
| `EcsWorld.endOfTick()` | Already shipped | [src/world.ts](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/world.ts) |
| `simpleComponent<T>()` | Already shipped | [src/component-store.ts](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/component-store.ts), [docs/component-store.md](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/docs/component-store.md) |
| `FixedIntervalTickSource` | Already shipped | [src/modules/tick/fixed-interval-tick-source.ts](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/tick/fixed-interval-tick-source.ts), [src/modules/tick/README.md](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/tick/README.md) |
| Pointer input support (`PointerProvider`) | Already shipped | [src/modules/input/pointer-provider.ts](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/input/pointer-provider.ts), [src/modules/input/README.md](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/input/README.md) |
| Raw viewport pointer coordinates on `PointerState` | Already shipped | [src/modules/input/pointer-provider.ts](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/input/pointer-provider.ts), [src/modules/input/pointer-provider.test.ts](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/input/pointer-provider.test.ts), [src/modules/input/README.md](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/input/README.md) |
| Shared-provider ownership split in `modules/input` | Already shipped | [src/modules/input/input-state.ts](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/input/input-state.ts), [src/modules/input/input.test.ts](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/input/input.test.ts), [src/modules/input/README.md](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/input/README.md) |
| `registryComponent(...)` helper | Already shipped | [src/component-store.ts](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/component-store.ts), [src/registry-component.test.ts](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/registry-component.test.ts), [docs/component-store.md](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/docs/component-store.md) |
| `modules/lifetime` | Already shipped | [src/modules/lifetime/lifetime.ts](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/lifetime/lifetime.ts), [src/modules/lifetime/README.md](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/lifetime/README.md) |
| Spatial projection helpers (`cellOfPoint`, `cellsForAabb`, `cellsForCircle`) and grid-sync helper (`makeGridSyncOnMove`) | Already shipped | [src/modules/spatial/projections.ts](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/spatial/projections.ts), [src/modules/spatial/grid-sync.ts](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/spatial/grid-sync.ts), [src/modules/spatial/README.md](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/spatial/README.md) |
| `modules/render-dom` V1 | Already shipped | [src/modules/render-dom/index.ts](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/render-dom/index.ts), [src/modules/render-dom/dom-renderer.ts](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/render-dom/dom-renderer.ts), [src/modules/render-dom/README.md](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/render-dom/README.md) |

The first summary over-called these as future additions because it was
based on the postmortems alone. The codebase check above is the source of
truth.

## Missing additions to keep on the roadmap

Everything below was checked against the current engine and is still
missing.

### `modules/render-dom` V2 — deferred

**Scope.** V2 follow-ups for DOM rendering that are intentionally not in
V1: consumer-calibrated lifecycle integration (event-driven DOM updates),
and higher-level helpers for zone/container reparenting policies.

**Why it is here.** V1 now ships the shared DOM renderer scaffolding
(entity-node bookkeeping, orphan cleanup, stable `data-entity-id`
contract, and reconcile hook), but keeps policy-heavy behavior in
consumers.

**Verification.** V1 exists in
[src/modules/render-dom/index.ts](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/render-dom/index.ts)
with implementation/tests in `dom-renderer.ts` / `dom-renderer.test.ts`.
No lifecycle-event based DOM diffing primitive ships in core today.

**Promotion path.** Path A. Wait for a second DOM-heavy consumer proving a
shared event-driven update shape.

### Local-multiplayer player-slot / input-owner helper — speculative

**Scope.** A tiny helper for stable local player identity and routing,
useful when multiple inputs map to multiple controlled entities.

**Why it is here.** Local Pong kept player identity as the app-level
union `'left' | 'right'`, which was the right decision for one consumer.
The postmortem only opens this as a promotion candidate if another
local-multiplayer example appears.

**Verification.** There is no engine-level player-slot, input-owner, or
local-multiplayer helper under `src/` today.

**Promotion path.** Path A. Do not design this from a single Pong-like
consumer.

### 3D sibling modules — speculative

**Scope.** Parallel 3D modules rather than mutating the 2D contracts:

- `modules/transform-3d`
- `modules/collision-3d`
- `modules/kinematics-3d`

**Why it is here.** The 3D platformer proved the core is dimension
agnostic, but it also had to define 3D-shaped position / collision /
grounding components locally.

**Verification.** No `*3d*` engine modules exist under `src/modules/`.
The existing long-horizon roadmap already captures the broader 3D-sibling
direction in [ecs-module-backlog.md](ecs-module-backlog.md), but these
specific module names are still absent from the engine.

**Promotion path.** Path A. Promote once a second 3D consumer confirms
the shared shapes.

## Priority order

If these move from backlog to implementation, the evidence from the
postmortems points at this order:

1. `modules/render-dom` V2
2. 3D sibling modules
3. Local-multiplayer player-slot / input-owner helper

That ordering is not "build all of these now". It is only the order in
which the current postmortem evidence suggests they would pay off once a
second consumer or an explicit pain report arrives.
