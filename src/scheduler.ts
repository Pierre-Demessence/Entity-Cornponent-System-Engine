/** A component-like reference for declaring data access on a system. Only `name` is read. */
export interface ComponentRef {
  readonly name: string;
}

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
  /**
   * Components this system reads from. Informational in DEV mode: the
   * scheduler warns if a reader's last writer in the sorted order is not
   * transitively reachable via `runAfter`/`runBefore`. No runtime effect
   * in production. Foundation for future parallel execution.
   */
  readonly reads?: readonly ComponentRef[];
  /** Names of systems that must run before this one. */
  readonly runAfter?: readonly string[];
  /** Names of systems that must run after this one. */
  readonly runBefore?: readonly string[];
  /** Components this system writes to. See `reads` for semantics. */
  readonly writes?: readonly ComponentRef[];
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
      if (import.meta.env.DEV)
        this.checkAccessOrdering(this.sorted, byName);
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
    if (import.meta.env.DEV)
      this.checkAccessOrdering(result, byName);
    return result;
  }

  /**
   * DEV-only: for each system that reads a component, verify that every prior
   * writer of that component in the sorted order is reachable from this
   * system through declared `runAfter`/`runBefore` edges. If not, emit a
   * `console.warn` — the ordering happens to work today but the dependency
   * is implicit, so any reorder could silently break it.
   */
  private checkAccessOrdering(
    sorted: readonly SchedulableSystem<TCtx>[],
    byName: ReadonlyMap<string, SchedulableSystem<TCtx>>,
  ): void {
    // Build reverse-reachability: for each system name, the set of system
    // names it transitively runs after (including via runBefore from others).
    const predecessors = new Map<string, Set<string>>();
    for (const sys of sorted) predecessors.set(sys.name, new Set());
    // Direct edges: A runAfter B  =>  B ∈ preds(A); C runBefore D  =>  C ∈ preds(D).
    for (const sys of sorted) {
      if (sys.runAfter) {
        for (const dep of sys.runAfter) {
          if (byName.has(dep))
            predecessors.get(sys.name)!.add(dep);
        }
      }
      if (sys.runBefore) {
        for (const target of sys.runBefore) {
          if (byName.has(target))
            predecessors.get(target)?.add(sys.name);
        }
      }
    }
    // Transitive closure in sorted order: preds(X) ⊇ preds(Y) for each Y ∈ preds(X).
    for (const sys of sorted) {
      const preds = predecessors.get(sys.name)!;
      for (const p of [...preds]) {
        const ppreds = predecessors.get(p);
        if (ppreds) {
          for (const pp of ppreds) preds.add(pp);
        }
      }
    }

    // Walk sorted order, tracking the last writer per component name.
    const lastWriter = new Map<string, string>();
    for (const sys of sorted) {
      if (sys.reads) {
        for (const c of sys.reads) {
          const writer = lastWriter.get(c.name);
          if (writer && writer !== sys.name && !predecessors.get(sys.name)!.has(writer)) {
            console.warn(
              `[ecs/scheduler] System "${sys.name}" reads component "${c.name}" written by "${writer}" earlier in the sort order, but "${sys.name}" does not declare runAfter "${writer}" (directly or transitively). The ordering is implicit; declare the dependency to make it explicit.`,
            );
          }
        }
      }
      if (sys.writes) {
        for (const c of sys.writes) lastWriter.set(c.name, sys.name);
      }
    }
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
