/**
 * A behaviour-tree tick result. `running` means the node needs more ticks
 * to finish (e.g. an agent still travelling to a target); composites use
 * it to short-circuit and resume the same branch next frame.
 */
export type BtStatus = 'failure' | 'running' | 'success';

/**
 * A tree node: a pure function of the (per-agent) context returning a
 * status. Reactive by design — the whole tree is re-ticked from the root
 * each frame, so a higher-priority branch preempts a lower one the moment
 * its condition flips. Cross-tick memory belongs on the context (a
 * "blackboard"), not inside nodes, which lets one shared tree drive many
 * agents.
 */
export type BtNode<TCtx> = (ctx: TCtx) => BtStatus;

/**
 * Run children in order (logical AND). Returns `failure` on the first
 * child that fails, `running` on the first that is running, and
 * `success` only if every child succeeds.
 */
export function sequence<TCtx>(...children: BtNode<TCtx>[]): BtNode<TCtx> {
  return (ctx) => {
    for (const child of children) {
      const status = child(ctx);
      if (status !== 'success')
        return status; // failure or running short-circuits
    }
    return 'success';
  };
}

/**
 * Run children in order until one does not fail (logical OR / fallback).
 * Returns `success` on the first child that succeeds, `running` on the
 * first that is running, and `failure` only if every child fails.
 */
export function selector<TCtx>(...children: BtNode<TCtx>[]): BtNode<TCtx> {
  return (ctx) => {
    for (const child of children) {
      const status = child(ctx);
      if (status !== 'failure')
        return status; // success or running short-circuits
    }
    return 'failure';
  };
}

/** Swap `success` ⇄ `failure`; `running` passes through. */
export function inverter<TCtx>(child: BtNode<TCtx>): BtNode<TCtx> {
  return (ctx) => {
    const status = child(ctx);
    if (status === 'success')
      return 'failure';
    if (status === 'failure')
      return 'success';
    return 'running';
  };
}

/** Leaf: `success` when `pred` is true, else `failure`. */
export function condition<TCtx>(pred: (ctx: TCtx) => boolean): BtNode<TCtx> {
  return ctx => (pred(ctx) ? 'success' : 'failure');
}

/**
 * Leaf: run `fn` and use its status. Return `success` for an instant
 * effect, `running` for a behaviour that spans ticks (travel, wait), or
 * `failure` when the action can't proceed.
 */
export function action<TCtx>(fn: (ctx: TCtx) => BtStatus): BtNode<TCtx> {
  return ctx => fn(ctx);
}
