/** Contract for a system that can be scheduled with dependency ordering. */
export interface SchedulableSystem<TCtx> {
  readonly name: string;
  /**
   * Optional phase name. When the scheduler has been constructed with a
   * non-empty phase list, every system MUST declare a phase from that list
   * and `runAfter`/`runBefore` references must stay within the same phase.
   * Phase names are declared per-scheduler by the app — the core ships no
   * defaults. A turn-based game might pick `['input','logic','render']`; a
   * real-time one might pick `['input','physics','post-physics','render']`.
   */
  readonly phase?: string;
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

export interface SchedulerOptions {
  /**
   * Ordered list of phase names. When provided, every system must declare a
   * `phase` from this list; systems execute in phase order, and `runAfter`/
   * `runBefore` edges must stay within the same phase (cross-phase ordering
   * is expressed via the phase list itself). Phase names are opaque strings
   * — the scheduler attaches no meaning to them.
   *
   * When omitted or empty, the scheduler operates in legacy mode: systems
   * must NOT declare a `phase`, and ordering is pure `runAfter`/`runBefore`
   * DAG sorting.
   */
  readonly phases?: readonly string[];
}

/**
 * Topologically sorts systems by their declared dependencies and runs them in order.
 * Uses Kahn's algorithm with stable insertion-order tiebreaking.
 *
 * Optional **phase mode**: when constructed with `{ phases: [...] }`, the scheduler
 * groups systems by phase first (in the order given), then DAG-sorts within each
 * phase. Cross-phase `runAfter`/`runBefore` edges are rejected — use the phase list
 * to express cross-phase ordering.
 *
 * Lifecycle: systems added via `add()` receive `init(ctx)` on the next `run(ctx)` before
 * their first tick. Systems removed via `remove()` receive `dispose(ctx)` on the following
 * `run(ctx)`, or immediately via `disposeAll(ctx)`.
 */
export class Scheduler<TCtx> {
  private readonly declaredPhases: readonly string[];
  private entries: SchedulableSystem<TCtx>[] = [];
  private initialized = new Set<string>();
  private pendingDispose: SchedulableSystem<TCtx>[] = [];
  private readonly phaseIndex: ReadonlyMap<string, number>;

  private sorted: SchedulableSystem<TCtx>[] | null = null;

  constructor(options: SchedulerOptions = {}) {
    this.declaredPhases = options.phases ?? [];
    const seen = new Set<string>();
    for (const p of this.declaredPhases) {
      if (seen.has(p))
        throw new Error(`Duplicate phase name: "${p}"`);
      seen.add(p);
    }
    this.phaseIndex = new Map(this.declaredPhases.map((p, i) => [p, i]));
  }

  /** Register a system. Invalidates any previously computed sort order. */
  add(system: SchedulableSystem<TCtx>): this {
    if (this.declaredPhases.length === 0) {
      if (system.phase !== undefined) {
        throw new Error(`System "${system.name}" declares phase "${system.phase}" but scheduler was constructed without phases`);
      }
    }
    else {
      if (system.phase === undefined) {
        throw new Error(`System "${system.name}" must declare a phase (one of: ${this.declaredPhases.join(', ')})`);
      }
      if (!this.phaseIndex.has(system.phase)) {
        throw new Error(`System "${system.name}" declares unknown phase "${system.phase}" (known: ${this.declaredPhases.join(', ')})`);
      }
    }
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

    if (this.declaredPhases.length === 0) {
      this.sorted = this.sortSubset(this.entries, byName);
      return this.sorted;
    }

    // Phase mode: group, validate cross-phase edges, sort each subset, concatenate.
    this.validateCrossPhaseEdges(byName);
    const buckets = new Map<string, SchedulableSystem<TCtx>[]>();
    for (const p of this.declaredPhases) buckets.set(p, []);
    for (const sys of this.entries) buckets.get(sys.phase!)!.push(sys);

    const result: SchedulableSystem<TCtx>[] = [];
    for (const p of this.declaredPhases) {
      result.push(...this.sortSubset(buckets.get(p)!, byName));
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

  private sortSubset(
    subset: readonly SchedulableSystem<TCtx>[],
    byName: ReadonlyMap<string, SchedulableSystem<TCtx>>,
  ): SchedulableSystem<TCtx>[] {
    const names = new Set(subset.map(s => s.name));
    const edges = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();
    for (const sys of subset) {
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

    for (const sys of subset) {
      if (sys.runAfter) {
        for (const dep of sys.runAfter) {
          if (!names.has(dep) && !byName.has(dep)) {
            throw new Error(`System "${sys.name}" declares runAfter unknown system "${dep}"`);
          }
          if (names.has(dep))
            addEdge(dep, sys.name);
        }
      }
      if (sys.runBefore) {
        for (const target of sys.runBefore) {
          if (!names.has(target) && !byName.has(target)) {
            throw new Error(`System "${sys.name}" declares runBefore unknown system "${target}"`);
          }
          if (names.has(target))
            addEdge(sys.name, target);
        }
      }
    }

    // Kahn's algorithm with stable insertion-order tiebreaking
    const insertionOrder = new Map(subset.map((s, i) => [s.name, i]));
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

    if (result.length !== subset.length) {
      const visited = new Set(result.map(s => s.name));
      const stuck = subset.filter(s => !visited.has(s.name)).map(s => s.name);
      throw new Error(`Circular dependency among systems: ${stuck.join(', ')}`);
    }

    return result;
  }

  * [Symbol.iterator](): Generator<SchedulableSystem<TCtx>> {
    if (!this.sorted)
      this.build();
    yield* this.sorted!;
  }

  private validateCrossPhaseEdges(byName: ReadonlyMap<string, SchedulableSystem<TCtx>>): void {
    for (const sys of this.entries) {
      const myPhase = sys.phase!;
      const check = (dep: string, direction: 'runAfter' | 'runBefore') => {
        const other = byName.get(dep);
        if (other && other.phase !== myPhase) {
          throw new Error(
            `System "${sys.name}" (phase "${myPhase}") declares ${direction} "${dep}" (phase "${other.phase}") — cross-phase dependencies are not allowed; use the phase list to order across phases`,
          );
        }
      };
      if (sys.runAfter) {
        for (const dep of sys.runAfter) check(dep, 'runAfter');
      }
      if (sys.runBefore) {
        for (const target of sys.runBefore) check(target, 'runBefore');
      }
    }
  }
}
