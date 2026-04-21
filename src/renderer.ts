/**
 * "How do I draw the world" contract. Core ships the interface; concrete
 * renderers (canvas2d, WebGL, PIXI, server-side image exporter, test
 * harness) live in `@pierre/ecs/modules/render-*`.
 *
 * A `Renderer<TCtx>` is intentionally one-method. The `TCtx` type
 * parameter is the consumer's render context — typically a structural
 * type like `{ ctx2d: CanvasRenderingContext2D; world: EcsWorld }` —
 * and the renderer consumes whatever fields it needs via structural
 * typing. This keeps renderers composable: a consumer can hold an
 * array of renderers (background layer, entities, overlay) and call
 * them in sequence within its rAF callback.
 *
 * Renderers do NOT own the tick loop, canvas, or world — the consumer
 * does. This mirrors the `InputProvider` / `TickSource` split: core
 * exposes contracts, modules provide default implementations, and the
 * game wires them together.
 */
export interface Renderer<TCtx> {
  render: (ctx: TCtx) => void;
}
