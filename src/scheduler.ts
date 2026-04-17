/** Contract for a system that can be scheduled with dependency ordering. */
export interface SchedulableSystem<TCtx> {
  readonly name: string;
  /** Names of systems that must run before this one. */
  readonly runAfter?: readonly string[];
  /** Names of systems that must run after this one. */
  readonly runBefore?: readonly string[];
  /** Optional teardown called by the scheduler after the system is removed. */
  dispose?: (ctx: TCtx) => void;
  /** Optional one-time setup called by the scheduler before the system's first `run`. */
  init?: (ctx: TCtx) => void;
  run: (ctx: TCtx) => void;
}

/**
 * Topologically sorts systems by their declared dependencies and runs them in order.
 * Uses Kahn's algorithm with stable insertion-order tiebreaking.
 *
 * Lifecycle: systems added via `add()` receive `init(ctx)` on the next `run(ctx)` before
 * their first tick. Systems removed via `remove()` receive `dispose(ctx)` on the following
 * `run(ctx)`, or immediately via `disposeAll(ctx)`.
 */
export class Scheduler<TCtx> {
  private entries: SchedulableSystem<TCtx>[] = [];
  private initialized = new Set<string>();
  private pendingDispose: SchedulableSystem<TCtx>[] = [];

  private sorted: SchedulableSystem<TCtx>[] | null = null;

  /** Register a system. Invalidates any previously computed sort order. */
  add(system: SchedulableSystem<TCtx>): this {
    this.entries.push(system);
    this.sorted = null;
    return this;
  }

  /** Resolve dependency graph and return the execution order. Throws on cycles or unknown dependencies. */
  build(): readonly SchedulableSystem<TCtx>[] {
    const byName = new Map<string, SchedulableSystem<TCtx>>();
    for (const sys of this.entries) {
      if (byName.has(sys.name))
        throw new Error(`Duplicate system name: "${sys.name}"`);
      byName.set(sys.name, sys);
    }

    const edges = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();
    for (const sys of this.entries) {
      edges.set(sys.name, new Set());
      inDegree.set(sys.name, 0);
    }

    const addEdge = (from: string, to: string) => {
      const fromEdges = edges.get(from);
      if (!fromEdges)
        throw new Error(`System "${to}" declares runAfter unknown system "${from}"`);
      if (!edges.has(to))
        throw new Error(`System "${from}" declares runBefore unknown system "${to}"`);
      if (fromEdges.has(to))
        return;
      fromEdges.add(to);
      inDegree.set(to, inDegree.get(to)! + 1);
    };

    for (const sys of this.entries) {
      if (sys.runAfter) {
        for (const dep of sys.runAfter) addEdge(dep, sys.name);
      }
      if (sys.runBefore) {
        for (const target of sys.runBefore) addEdge(sys.name, target);
      }
    }

    // Kahn's algorithm with stable insertion-order tiebreaking
    const insertionOrder = new Map(this.entries.map((s, i) => [s.name, i]));
    const queue: string[] = [];
    const enqueue = (name: string) => {
      queue.push(name);
      queue.sort((a, b) => insertionOrder.get(a)! - insertionOrder.get(b)!);
    };

    for (const [name, degree] of inDegree) {
      if (degree === 0)
        enqueue(name);
    }

    const result: SchedulableSystem<TCtx>[] = [];
    while (queue.length > 0) {
      const name = queue.shift()!;
      result.push(byName.get(name)!);
      for (const neighbor of edges.get(name)!) {
        const newDegree = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0)
          enqueue(neighbor);
      }
    }

    if (result.length !== this.entries.length) {
      const visited = new Set(result.map(s => s.name));
      const stuck = this.entries.filter(s => !visited.has(s.name)).map(s => s.name);
      throw new Error(`Circular dependency among systems: ${stuck.join(', ')}`);
    }

    this.sorted = result;
    return result;
  }

  /** Immediately call `dispose(ctx)` on every registered system (and drain any pending disposes). Use at shutdown. */
  disposeAll(ctx: TCtx): void {
    if (this.pendingDispose.length > 0) {
      const toDispose = this.pendingDispose;
      this.pendingDispose = [];
      for (const sys of toDispose) sys.dispose!(ctx);
    }
    for (const sys of this.entries) {
      if (this.initialized.has(sys.name)) {
        this.initialized.delete(sys.name);
        sys.dispose?.(ctx);
      }
    }
  }

  /** Sorted system names in execution order. Builds if needed. */
  get order(): readonly string[] {
    if (!this.sorted)
      this.build();
    return this.sorted!.map(s => s.name);
  }

  /** Unregister a system by name. Invalidates any previously computed sort order. Queues `dispose` for the next `run` if the system had been initialized. */
  remove(name: string): this {
    const idx = this.entries.findIndex(s => s.name === name);
    if (idx === -1)
      return this;
    const [removed] = this.entries.splice(idx, 1);
    if (this.initialized.has(name)) {
      this.initialized.delete(name);
      if (removed.dispose)
        this.pendingDispose.push(removed);
    }
    this.sorted = null;
    return this;
  }

  /** Execute all systems in dependency order, building if needed. Drains deferred `dispose`s and lazy-inits new systems with the given ctx. */
  run(ctx: TCtx): void {
    if (this.pendingDispose.length > 0) {
      const toDispose = this.pendingDispose;
      this.pendingDispose = [];
      for (const sys of toDispose) sys.dispose!(ctx);
    }
    for (const sys of this) {
      if (!this.initialized.has(sys.name)) {
        this.initialized.add(sys.name);
        sys.init?.(ctx);
      }
      sys.run(ctx);
    }
  }

  get size(): number {
    return this.entries.length;
  }

  * [Symbol.iterator](): Generator<SchedulableSystem<TCtx>> {
    if (!this.sorted)
      this.build();
    yield* this.sorted!;
  }
}
