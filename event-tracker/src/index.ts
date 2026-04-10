// @radzor/event-tracker — Track user events and page views with batched HTTP flushes

export interface EventTrackerConfig {
  endpoint: string;
  batchSize?: number;
  flushIntervalMs?: number;
  headers?: Record<string, string>;
}

export interface TrackedEvent {
  type: "track" | "identify" | "pageView";
  eventName?: string;
  userId?: string;
  properties?: Record<string, unknown>;
  traits?: Record<string, unknown>;
  url?: string;
  referrer?: string;
  timestamp: number;
  sessionId: string;
}

export interface TrackingResult {
  eventCount: number;
  success: boolean;
  statusCode?: number;
  error?: string;
}

export interface EventTrackedPayload {
  eventName: string;
  userId?: string;
  timestamp: number;
  bufferSize: number;
}

export interface FlushPayload {
  eventCount: number;
  success: boolean;
}

export type EventMap = {
  onEventTracked: EventTrackedPayload;
  onFlush: FlushPayload;
};

export type Listener<T> = (event: T) => void;

function generateSessionId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 16; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export class EventTracker {
  private config: Required<EventTrackerConfig>;
  private buffer: TrackedEvent[] = [];
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private currentUserId: string | undefined;
  private currentTraits: Record<string, unknown> = {};
  private sessionId: string;
  private flushing = false;

  constructor(config: EventTrackerConfig) {
    this.config = {
      endpoint: config.endpoint,
      batchSize: config.batchSize ?? 20,
      flushIntervalMs: config.flushIntervalMs ?? 5000,
      headers: config.headers ?? {},
    };
    this.sessionId = generateSessionId();
    this.startFlushTimer();
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]!.push(listener);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const list = this.listeners[event];
    if (list) {
      this.listeners[event] = list.filter((l) => l !== listener) as typeof list;
    }
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const list = this.listeners[event];
    if (list) list.forEach((l) => l(payload));
  }

  // ─── Actions ─────────────────────────────────────────────

  track(eventName: string, properties?: Record<string, unknown>): void {
    const entry: TrackedEvent = {
      type: "track",
      eventName,
      userId: this.currentUserId,
      properties: { ...this.currentTraits, ...properties },
      timestamp: Date.now(),
      sessionId: this.sessionId,
    };
    this.addToBuffer(entry, eventName);
  }

  identify(userId: string, traits?: Record<string, unknown>): void {
    this.currentUserId = userId;
    if (traits) {
      this.currentTraits = { ...this.currentTraits, ...traits };
    }
    const entry: TrackedEvent = {
      type: "identify",
      userId,
      traits: this.currentTraits,
      timestamp: Date.now(),
      sessionId: this.sessionId,
    };
    this.addToBuffer(entry, "identify");
  }

  pageView(url: string, referrer?: string): void {
    const entry: TrackedEvent = {
      type: "pageView",
      userId: this.currentUserId,
      url,
      referrer,
      properties: this.currentTraits,
      timestamp: Date.now(),
      sessionId: this.sessionId,
    };
    this.addToBuffer(entry, "pageView");
  }

  async flush(): Promise<TrackingResult> {
    if (this.buffer.length === 0) {
      return { eventCount: 0, success: true };
    }

    if (this.flushing) {
      return { eventCount: 0, success: true };
    }

    this.flushing = true;
    const batch = this.buffer.splice(0);
    const eventCount = batch.length;

    try {
      const response = await fetch(this.config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.config.headers,
        },
        body: JSON.stringify(batch),
      });

      const result: TrackingResult = {
        eventCount,
        success: response.ok,
        statusCode: response.status,
      };

      if (!response.ok) {
        result.error = `HTTP ${response.status}: ${response.statusText}`;
        // Put events back on failure so they aren't lost
        this.buffer.unshift(...batch);
      }

      this.emit("onFlush", { eventCount, success: response.ok });
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      // Put events back on network failure
      this.buffer.unshift(...batch);

      const result: TrackingResult = {
        eventCount,
        success: false,
        error: errorMsg,
      };

      this.emit("onFlush", { eventCount, success: false });
      return result;
    } finally {
      this.flushing = false;
    }
  }

  // ─── Lifecycle ───────────────────────────────────────────

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  getBufferSize(): number {
    return this.buffer.length;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  // ─── Private ─────────────────────────────────────────────

  private addToBuffer(entry: TrackedEvent, label: string): void {
    this.buffer.push(entry);

    this.emit("onEventTracked", {
      eventName: label,
      userId: this.currentUserId,
      timestamp: entry.timestamp,
      bufferSize: this.buffer.length,
    });

    if (this.buffer.length >= this.config.batchSize) {
      this.flush();
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      if (this.buffer.length > 0) {
        this.flush();
      }
    }, this.config.flushIntervalMs);

    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }
}

export default EventTracker;
