import type { EntityId } from './entity-id';

/**
 * Engine-internal lifecycle events emitted by `EcsWorld`. These are distinct
 * from any game-specific event union — they describe structural changes to
 * the entity/component graph and are consumed by tooling (dev inspector,
 * plugins, network sync, persistence tracking).
 *
 * `set()` on an existing id fires `ComponentRemoved` (via the store's
 * replace-semantics) followed by `ComponentAdded`, so consumers can treat
 * the pair as an update.
 */
export type LifecycleEvent
  = | { type: 'EntityCreated'; id: EntityId }
    | { type: 'EntityDestroyed'; id: EntityId }
    | { type: 'ComponentAdded'; id: EntityId; component: string; value: unknown }
    | { type: 'ComponentRemoved'; id: EntityId; component: string };
