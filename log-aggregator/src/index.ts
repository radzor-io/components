// @radzor/log-aggregator — Structured logging with multiple transports (console, HTTP, custom)

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  meta: Record<string, unknown>;
}

export interface Transport {
  name: string;
  write(entry: LogEntry): void | Promise<void>;
}

export interface TransportConfig {
  type: "console" | "http" | "custom";
  // For HTTP transport
  url?: string;
  headers?: Record<string, string>;
  // For custom transport
  handler?: (entry: LogEntry) => void | Promise<void>;
  // Transport-specific level filter
  level?: LogLevel;
}

export interface LogAggregatorConfig {
  level?: LogLevel;
  defaultMeta?: Record<string, unknown>;
  transports?: TransportConfig[];
}

export interface LogPayload {
  level: string;
  message: string;
  timestamp: string;
}

export type EventMap = {
  onLog: LogPayload;
};

export type Listener<T> = (event: T) => void;

// ─── Built-in Transports ──────────────────────────────────

class ConsoleTransport implements Transport {
  name = "console";
  private minLevel: number;

  constructor(level: LogLevel = "debug") {
    this.minLevel = LEVEL_ORDER[level];
  }

  write(entry: LogEntry): void {
    if (LEVEL_ORDER[entry.level] < this.minLevel) return;

    const json = JSON.stringify(entry);

    switch (entry.level) {
      case "debug":
        console.debug(json);
        break;
      case "info":
        console.info(json);
        break;
      case "warn":
        console.warn(json);
        break;
      case "error":
      case "fatal":
        console.error(json);
        break;
    }
  }
}

class HttpTransport implements Transport {
  name: string;
  private url: string;
  private headers: Record<string, string>;
  private buffer: LogEntry[] = [];
  private batchSize = 10;
  private flushTimer: ReturnType<typeof setInterval>;
  private minLevel: number;

  constructor(url: string, headers: Record<string, string> = {}, level: LogLevel = "debug") {
    this.name = `http:${url}`;
    this.url = url;
    this.headers = headers;
    this.minLevel = LEVEL_ORDER[level];

    // Flush every 5 seconds
    this.flushTimer = setInterval(() => this.flush(), 5000);
    if (this.flushTimer.unref) this.flushTimer.unref();
  }

  write(entry: LogEntry): void {
    if (LEVEL_ORDER[entry.level] < this.minLevel) return;

    this.buffer.push(entry);
    if (this.buffer.length >= this.batchSize) {
      this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0);
    try {
      await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...this.headers },
        body: JSON.stringify(batch),
      });
    } catch {
      // Fire-and-forget — don't throw
    }
  }

  destroy(): void {
    clearInterval(this.flushTimer);
    this.flush();
  }
}

class CustomTransport implements Transport {
  name = "custom";
  private handler: (entry: LogEntry) => void | Promise<void>;
  private minLevel: number;

  constructor(handler: (entry: LogEntry) => void | Promise<void>, level: LogLevel = "debug") {
    this.handler = handler;
    this.minLevel = LEVEL_ORDER[level];
  }

  write(entry: LogEntry): void | Promise<void> {
    if (LEVEL_ORDER[entry.level] < this.minLevel) return;
    return this.handler(entry);
  }
}

// ─── Class ────────────────────────────────────────────────

export class LogAggregator {
  private minLevel: number;
  private levelName: LogLevel;
  private defaultMeta: Record<string, unknown>;
  private transports: Transport[] = [];
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: LogAggregatorConfig = {}) {
    this.levelName = config.level ?? "info";
    this.minLevel = LEVEL_ORDER[this.levelName];
    this.defaultMeta = config.defaultMeta ?? {};

    // Initialize pre-configured transports
    if (config.transports) {
      for (const tc of config.transports) {
        this.addTransportFromConfig(tc);
      }
    }

    // Default to console if no transports configured
    if (this.transports.length === 0) {
      this.transports.push(new ConsoleTransport(this.levelName));
    }
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

  log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < this.minLevel) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      meta: { ...this.defaultMeta, ...meta },
    };

    for (const transport of this.transports) {
      try {
        transport.write(entry);
      } catch {
        // Silently ignore transport errors
      }
    }

    this.emit("onLog", { level, message, timestamp: entry.timestamp });
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log("debug", message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log("info", message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log("warn", message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log("error", message, meta);
  }

  fatal(message: string, meta?: Record<string, unknown>): void {
    this.log("fatal", message, meta);
  }

  setLevel(level: LogLevel): void {
    this.levelName = level;
    this.minLevel = LEVEL_ORDER[level];
  }

  getLevel(): LogLevel {
    return this.levelName;
  }

  addTransport(transport: Transport): void {
    this.transports.push(transport);
  }

  removeTransport(name: string): void {
    this.transports = this.transports.filter((t) => t.name !== name);
  }

  getTransportNames(): string[] {
    return this.transports.map((t) => t.name);
  }

  /**
   * Create a child logger that inherits transports but can have additional meta.
   */
  child(meta: Record<string, unknown>): LogAggregator {
    const child = new LogAggregator({
      level: this.levelName,
      defaultMeta: { ...this.defaultMeta, ...meta },
    });
    // Share transports
    child.transports = this.transports;
    return child;
  }

  // ─── Private ────────────────────────────────────────────

  private addTransportFromConfig(tc: TransportConfig): void {
    switch (tc.type) {
      case "console":
        this.transports.push(new ConsoleTransport(tc.level ?? this.levelName));
        break;
      case "http":
        if (tc.url) {
          this.transports.push(new HttpTransport(tc.url, tc.headers ?? {}, tc.level ?? this.levelName));
        }
        break;
      case "custom":
        if (tc.handler) {
          this.transports.push(new CustomTransport(tc.handler, tc.level ?? this.levelName));
        }
        break;
    }
  }
}

export { ConsoleTransport, HttpTransport, CustomTransport };
export default LogAggregator;
