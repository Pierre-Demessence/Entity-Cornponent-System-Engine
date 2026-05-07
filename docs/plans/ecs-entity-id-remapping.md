# Entity-ID Remapping on Import (A11) — deferred

Original audit entry: [ecs-engine-audit.md §A11](done/ecs-engine-audit.md#a11-entity-id-remapping-on-importnot-pursued).

## Problem

`ComponentStore.toSerialized` emits `[id, value]` tuples keyed by the source
world's `EntityId`. Loading a save into a different world, or merging two
saves into one, would collide ids — every component, tag, and reference
would need to be rewritten under a new id space.

Concrete scenarios that trigger the need:

- **Mod-import** — a user loads a third-party creature pack whose template
  saves contain pre-allocated ids that clash with the base game.
- **Save-slot merge** — "import your favorite party from save A into save B".
- **Multiplayer world-join** — late-joining client receives a partial world
  snapshot that must be stitched into the one already running locally.
- **Templates-as-saves** — authoring tool exports a room as a save fragment
  to be dropped into another world.

## Proposed Solution

An opt-in import path on `EcsWorld`:

```ts
world.loadJSON(data, {
  remap: 'auto',  // generate fresh ids, return Map<oldId, newId>
});

world.loadJSON(data, {
  remap: new Map([[42, 100], [43, 101]]),  // explicit mapping
});
```

Needs component-by-component rewrite of any `EntityId`-valued fields (e.g.
inventory owner refs, AI target memory, equipment wearer). Right now each
component def serializes/deserializes opaquely via `def.serialize` — we'd
either extend `ComponentDef<T>` with an optional `remapRefs?(value, remap)`
hook, or require consumers to own the rewrite themselves.

Likely ~100 lines + per-def hooks where needed + tests covering every
reference-carrying component.

## Why Deferred

Audit (2026-04-17) validated against the
[prototype-games-roadmap ladder](../roadmap/prototype-games-roadmap.md):
none of the planned prototypes (Snake, Asteroids, platformer, 3D game,
networked pong) need cross-world entity merging. Each spawns a fresh world.

The current game also doesn't need it — level transitions use
`transferEntity` (B2) for the player + inventory, and each level has its
own fresh id space.

Building the full remap infrastructure without a driver risks:

- Guessing wrong about which reference fields matter.
- Paying complexity cost (per-def hook, extra test surface) for zero value.
- Ossifying an API shape before real usage shakes out the right ergonomics.

## Trigger Conditions (reopen this plan when any are true)

- A mod-import / template-pack feature is scoped.
- A save-slot merge / party-import feature is scoped.
- A networked-multiplayer prototype (general-purpose roadmap Step 6, likely
  much later) reaches the late-join stage.
- An authoring tool wants to export entity subgraphs.

## Related

- [docs/plans/done/ecs-engine-audit.md](done/ecs-engine-audit.md) — original entry (§A11).
- [docs/roadmap/prototype-games-roadmap.md](../roadmap/prototype-games-roadmap.md) — prototype ladder used to validate no current driver exists.
