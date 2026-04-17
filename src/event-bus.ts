/** Passed to each handler during dispatch; allows a handler to consume the event and stop later handlers. */
export interface EventContext {
  readonly consumed: boolean;
  stopPropagation: () => void;
}

type EventHandler<TMap, K extends keyof TMap> = (event: TMap[K], ctx: EventContext) => void;

interface HandlerEntry<TMap> {
  handler: EventHandler<TMap, keyof TMap>;
  priority: number;
}

const DEFAULT_MAX_FLUSH_DEPTH = 3;

/**
 * Queue-based event bus with priority-ordered handlers.
 * Events are buffered via `emit()` and dispatched in batch by `flush()`.
 * Handlers emitted during flush are drained within the same flush (depth-limited).
 */
export class EventBus<TEvent extends { type: string }, TMap extends { [E in TEvent as E['type']]: E } = { [E in TEvent as E['type']]: E }> {
  private flushing = false;
  private listeners = new Map<keyof TMap, HandlerEntry<TMap>[]>();
  private queue: TEvent[] = [];

  /** Queue an event for dispatch on the next `flush()`. */
  emit(event: TEvent): void {
    this.queue.push(event);
  }

  /** Dispatch all queued events. Events emitted by handlers drain within the same flush, up to `maxDepth`. */
  flush(maxDepth = DEFAULT_MAX_FLUSH_DEPTH): void {
    if (this.flushing)
      return;

    this.flushing = true;
    try {
      let depth = 0;
      while (this.queue.length > 0) {
        if (depth >= maxDepth) {
          console.warn(`EventBus: max flush depth (${maxDepth}) reached, ${this.queue.length} events deferred`);
          break;
        }

        const events = this.queue;
        this.queue = [];

        for (const event of events) {
          const entries = this.listeners.get(event.type as keyof TMap);
          if (!entries)
            continue;

          let consumed = false;
          const ctx: EventContext = {
            get consumed() { return consumed; },
            stopPropagation() { consumed = true; },
          };

          for (const entry of [...entries]) {
            if (consumed)
              break;
            entry.handler(event as TMap[keyof TMap], ctx);
          }
        }

        depth++;
      }
    }
    finally {
      this.flushing = false;
    }
  }

  /** Remove a previously registered handler. */
  off<K extends keyof TMap & string>(type: K, handler: EventHandler<TMap, K>): void {
    const entries = this.listeners.get(type);
    if (!entries)
      return;
    const idx = entries.findIndex(e => e.handler === (handler as EventHandler<TMap, keyof TMap>));
    if (idx >= 0)
      entries.splice(idx, 1);
  }

  /** Subscribe to events of the given type. Higher priority runs first. Returns an unsubscribe function. */
  on<K extends keyof TMap & string>(type: K, handler: EventHandler<TMap, K>, priority = 0): () => void {
    const entry: HandlerEntry<TMap> = { handler: handler as EventHandler<TMap, keyof TMap>, priority };
    const entries = this.listeners.get(type);
    if (entries) {
      // Higher priority = runs first — insert in descending order
      let i = 0;
      while (i < entries.length && entries[i].priority >= priority) i++;
      entries.splice(i, 0, entry);
    }
    else {
      this.listeners.set(type, [entry]);
    }
    return () => this.off(type, handler);
  }
}
