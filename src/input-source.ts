/**
 * Low-level "where do raw input events come from" contract. Core ships
 * the interface; concrete providers (keyboard, gamepad, touch, synthetic
 * test harness, …) live in `@pierre/ecs/modules/input`.
 *
 * Providers emit raw `down`/`up` events keyed by a provider-defined
 * string `code` (for keyboards this is `KeyboardEvent.code` verbatim).
 * Translation from code to action is the responsibility of
 * `createInput(map, providers[])`.
 */
export type InputRawEvent
  = | { kind: 'down'; code: string }
    | { kind: 'up'; code: string };

export interface InputProvider {
  dispose: () => void;
  subscribe: (handler: (raw: InputRawEvent) => void) => () => void;
}
