# Plugin abstraction (core roadmap §4.4)

Ship the one genuinely-missing half of §4.4 "Plugin / Hook Architecture": a
Bevy-style **`Plugin`** — a reusable, install-once unit that bundles world
setup. The **hooks** the entry also lists already ship and are out of scope.

- **Roadmap entry:** [core-engine-roadmap.md](../../roadmap/core-engine-roadmap.md) §4.4.

## Already built (not this plan)

- Entity/component/tag hooks → `world.lifecycle` (`EventBus<LifecycleEvent>`)
  emits `EntityCreated` / `EntityDestroyed` / `ComponentAdded` /
  `ComponentRemoved` / `TagAdded` / `TagRemoved`.
- Tick start/end hooks → `TickRunner` `onBeforeFlush` / `onTickComplete` +
  scheduler phases.
- `onTurnStart` / `onTurnEnd` — "turn" is a game concept; core is
  domain-neutral, so these stay in `modules/turn-based`, not core.

## Out of scope (dropped from the entry)

- **Sandboxing.** Not canon (Bevy/Unity/Godot do not sandbox plugin code) and a
  library cannot meaningfully sandbox JS. Removed from §4.4's scope.

## Design — `src/plugin.ts` + `EcsWorld`

Canon: Bevy's `Plugin` trait (`fn build(&self, app: &mut App)`), where the
world is the app.

- `interface Plugin { readonly name: string; build(world: EcsWorld): void }`.
- `EcsWorld.use(...plugins: Plugin[]): this` — installs each plugin once. A
  duplicate `name` throws (`Plugin "X" already installed`). Returns `this` for
  chaining. `build` receives the world and registers whatever it provides
  (components, tags, systems, lifecycle subscriptions).
- `EcsWorld.hasPlugin(name: string): boolean` — query installed state.
- Installed-plugin names are **preserved across `clearAll`** (like component
  registrations, which a plugin's `build` created) — so re-`use`-ing a plugin
  after `clearAll` still throws rather than double-registering.
- Export `Plugin` (type-only) from `src/index.ts`.

No dependency-ordering / plugin-groups in V1 — a single missing operation, not a
coherent slice; add only when a consumer needs it.

## Tasks

- [x] `src/plugin.ts` — the `Plugin` interface with JSDoc.
- [x] `EcsWorld`: `installedPlugins` set, `use(...plugins)`, `hasPlugin(name)`.
- [x] Export `Plugin` from `src/index.ts`.
- [x] `src/plugin.test.ts` — build receives the world; install-once throws on
      duplicate; variadic install order; `hasPlugin`; a plugin that registers
      components/tags/systems works; installed state survives `clearAll`.
- [x] Gates: `npm run lint`, `npm run typecheck`, `npm test`;
      `npm run docs:api` + `npm run docs:usage` (new public export).
- [x] Peer review loop → LGTM.
- [x] Remove §4.4 from `core-engine-roadmap.md` (entry + order-list line);
      move this plan to `docs/plans/done/` in the final commit.
