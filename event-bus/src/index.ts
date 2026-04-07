// @radzor/event-bus — In-process typed pub/sub with wildcard patterns and history replay

export interface EventBusConfig {
  maxListeners?: number;
  historySize?: number;
  asyncHandlers?: boolean;
}

export interface PublishResult {
  event: string;
  handlersInvoked: number;
}

export interface PublishEvent {
  event: string;
  payload: unknown;
  handlersInvoked: number;
  timestamp: number;
}

export interface HandlerErrorEvent {
  event: string;
  error: Error;
  timestamp: number;
}

export type EventMap = {
  onPublish: PublishEvent;
  onHandlerError: HandlerErrorEvent;
};

export type Handler = (payload: unknown) => void | Promise<void>;
export type MetaListener<T> = (event: T) => void;

export interface Subscription {
  pattern: string;
  handler: Handler;
  once: boolean;
}

export interface HistoryEntry {
  event: string;
  payload: unknown;
  timestamp: number;
}

function matchPattern(pattern: string, eventName: string): boolean {
  if (pattern === eventName) return true;
  const patternParts = pattern.split(".");
  const eventParts = eventName.split(".");
  if (patternParts.length !== eventParts.length) return false;
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i] !== "*" && patternParts[i] !== eventParts[i]) return false;
  }
  return true;
}

export class EventBus {
  private config: Required<EventBusConfig>;
  private subscriptions: Subscription[] = [];
  private history: HistoryEntry[] = [];
  private metaListeners: { [K in keyof EventMap]?: MetaListener<EventMap[K]>[] } = {};

  constructor(config: EventBusConfig = {}) {
    this.config = {
      maxListeners: config.maxListeners ?? 100,
      historySize: config.historySize ?? 0,
      asyncHandlers: config.asyncHandlers ?? true,
    };
  }

  on<K extends keyof EventMap>(event: K, listener: MetaListener<EventMap[K]>): void {
    if (!this.metaListeners[event]) this.metaListeners[event] = [];
    this.metaListeners[event]!.push(listener);
  }

  off<K extends keyof EventMap>(event: K, listener: MetaListener<EventMap[K]>): void {
    const list = this.metaListeners[event];
    if (list) {
      this.metaListeners[event] = list.filter((l) => l !== listener) as typeof list;
    }
  }

  private emitMeta<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const list = this.metaListeners[event];
    if (list) list.forEach((l) => l(payload));
  }

  subscribe(pattern: string, handler: Handler): () => void {
    if (this.subscriptions.length >= this.config.maxListeners) {
      throw new Error(`EventBus maxListeners (${this.config.maxListeners}) exceeded`);
    }

    const sub: Subscription = { pattern, handler, once: false };
    this.subscriptions.push(sub);

    // Replay history for matching events if historySize > 0
    if (this.config.historySize > 0) {
      for (const entry of this.history) {
        if (matchPattern(pattern, entry.event)) {
          this.invokeHandler(sub, entry.event, entry.payload);
        }
      }
    }

    return () => {
      this.subscriptions = this.subscriptions.filter((s) => s !== sub);
    };
  }

  once(pattern: string, handler: Handler): () => void {
    if (this.subscriptions.length >= this.config.maxListeners) {
      throw new Error(`EventBus maxListeners (${this.config.maxListeners}) exceeded`);
    }

    const sub: Subscription = { pattern, handler, once: true };
    this.subscriptions.push(sub);

    return () => {
      this.subscriptions = this.subscriptions.filter((s) => s !== sub);
    };
  }

  async publish(event: string, payload?: unknown): Promise<PublishResult> {
    // Record in history
    if (this.config.historySize > 0) {
      this.history.push({ event, payload, timestamp: Date.now() });
      if (this.history.length > this.config.historySize) {
        this.history.shift();
      }
    }

    const matching = this.subscriptions.filter((s) => matchPattern(s.pattern, event));

    // Remove once-subscriptions before invoking to prevent double-removal race
    const onceSubs = matching.filter((s) => s.once);
    this.subscriptions = this.subscriptions.filter((s) => !onceSubs.includes(s));

    const invocations = matching.map((sub) => this.invokeHandler(sub, event, payload));

    if (this.config.asyncHandlers) {
      await Promise.all(invocations);
    }

    const handlersInvoked = matching.length;

    this.emitMeta("onPublish", {
      event,
      payload,
      handlersInvoked,
      timestamp: Date.now(),
    });

    return { event, handlersInvoked };
  }

  private async invokeHandler(sub: Subscription, event: string, payload: unknown): Promise<void> {
    try {
      await sub.handler(payload);
    } catch (err) {
      this.emitMeta("onHandlerError", {
        event,
        error: err instanceof Error ? err : new Error(String(err)),
        timestamp: Date.now(),
      });
    }
  }

  unsubscribeAll(event?: string): void {
    if (event === undefined) {
      this.subscriptions = [];
    } else {
      this.subscriptions = this.subscriptions.filter((s) => !matchPattern(s.pattern, event));
    }
  }

  getHistory(event?: string): HistoryEntry[] {
    if (!event) return [...this.history];
    return this.history.filter((e) => matchPattern(event, e.event));
  }
}

export default EventBus;
