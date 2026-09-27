import type { EcsWorld } from '#world';

/**
 * A reusable, install-once unit of world setup — the engine's extension point,
 * modelled on Bevy's `Plugin` trait where the world plays the role of the app.
 *
 * A plugin's {@link Plugin.build} receives the world and registers whatever the
 * plugin provides: components, tags, scheduler systems, and `world.lifecycle`
 * subscriptions. Install with {@link world!EcsWorld.use}; a plugin's
 * {@link Plugin.name} must be unique per world.
 *
 * @example
 * ```ts
 * const physics: Plugin = {
 *   name: 'physics',
 *   build(world) {
 *     world.registerComponent(VelocityDef);
 *     world.lifecycle.subscribe((e) => { ... });
 *   },
 * };
 * world.use(physics);
 * ```
 */
export interface Plugin {
  /** Unique identifier for this plugin within a world. */
  readonly name: string;
  /** Set up the world — register components/tags/systems and subscriptions. */
  build: (world: EcsWorld) => void;
}
