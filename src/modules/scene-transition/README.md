# @pierre/ecs/modules/scene-transition

Tick-boundary world-transition primitives for ECS games.

V1 scope: queue transition appliers between ticks, and transfer batches of
entities between worlds using `EcsWorld.transferEntity` semantics.

## API

```ts
type TransitionApplier = () => void;

class SceneTransitionQueue {
  enqueue(applier: TransitionApplier): void;
  replace(applier: TransitionApplier): void;
  applyNext(): boolean;
  takeNext(): TransitionApplier | null;
  hasPending(): boolean;
  clear(): void;
  readonly size: number;
}

function transferEntities(
  to: EcsWorld,
  from: EcsWorld,
  ids: readonly EntityId[],
  componentNames?: readonly string[],
): void;
```

## Notes

- `replace` provides last-write-wins behavior for games that only allow one
  pending transition at a time.
- `transferEntities` only copies components; tag transfer remains game-owned,
  matching `EcsWorld.transferEntity` semantics.
