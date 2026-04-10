// @radzor/error-tracker — Capture and report errors with context and breadcrumbs (Sentry-style)

export interface ErrorTrackerConfig {
  endpoint: string;
  dsn?: string;
  environment?: string;
  maxBreadcrumbs?: number;
  headers?: Record<string, string>;
}

export type ErrorLevel = "fatal" | "error" | "warning" | "info";

export interface Breadcrumb {
  category: string;
  message: string;
  level: ErrorLevel;
  data?: Record<string, unknown>;
  timestamp: number;
}

export interface ErrorReport {
  id: string;
  level: ErrorLevel;
  message: string;
  stack?: string;
  context: Record<string, unknown>;
  breadcrumbs: Breadcrumb[];
  timestamp: number;
  environment: string;
  runtime: string;
}

export interface ErrorCapturedPayload {
  id: string;
  level: string;
  message: string;
  sent: boolean;
}

export type EventMap = {
  onErrorCaptured: ErrorCapturedPayload;
};

export type Listener<T> = (event: T) => void;

// ─── Utilities ────────────────────────────────────────────

function generateId(): string {
  const chars = "0123456789abcdef";
  let id = "";
  for (let i = 0; i < 32; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  // Format as 8-4-4-4-12
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

function detectRuntime(): string {
  if (typeof process !== "undefined" && process.versions?.node) {
    return `node/${process.versions.node}`;
  }
  if (typeof navigator !== "undefined") {
    return `browser/${navigator.userAgent.split(" ").pop() ?? "unknown"}`;
  }
  return "unknown";
}

// ─── Class ────────────────────────────────────────────────

export class ErrorTracker {
  private config: Required<ErrorTrackerConfig>;
  private context: Record<string, Record<string, unknown>> = {};
  private breadcrumbs: Breadcrumb[] = [];
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};
  private runtime: string;

  constructor(config: ErrorTrackerConfig) {
    this.config = {
      endpoint: config.endpoint,
      dsn: config.dsn ?? "",
      environment: config.environment ?? "production",
      maxBreadcrumbs: config.maxBreadcrumbs ?? 50,
      headers: config.headers ?? {},
    };
    this.runtime = detectRuntime();
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

  async captureException(error: Error, extra?: Record<string, unknown>): Promise<string> {
    const id = generateId();

    const mergedContext = this.buildContext(extra);

    const report: ErrorReport = {
      id,
      level: "error",
      message: error.message,
      stack: error.stack,
      context: mergedContext,
      breadcrumbs: [...this.breadcrumbs],
      timestamp: Date.now(),
      environment: this.config.environment,
      runtime: this.runtime,
    };

    const sent = await this.sendReport(report);
    this.emit("onErrorCaptured", { id, level: "error", message: error.message, sent });

    return id;
  }

  async captureMessage(message: string, level: ErrorLevel = "info"): Promise<string> {
    const id = generateId();

    const report: ErrorReport = {
      id,
      level,
      message,
      context: this.buildContext(),
      breadcrumbs: [...this.breadcrumbs],
      timestamp: Date.now(),
      environment: this.config.environment,
      runtime: this.runtime,
    };

    const sent = await this.sendReport(report);
    this.emit("onErrorCaptured", { id, level, message, sent });

    return id;
  }

  setContext(key: string, value: Record<string, unknown>): void {
    this.context[key] = { ...this.context[key], ...value };
  }

  clearContext(key?: string): void {
    if (key) {
      delete this.context[key];
    } else {
      this.context = {};
    }
  }

  addBreadcrumb(breadcrumb: {
    category: string;
    message: string;
    level?: ErrorLevel;
    data?: Record<string, unknown>;
  }): void {
    const entry: Breadcrumb = {
      category: breadcrumb.category,
      message: breadcrumb.message,
      level: breadcrumb.level ?? "info",
      data: breadcrumb.data,
      timestamp: Date.now(),
    };

    this.breadcrumbs.push(entry);

    // Evict oldest breadcrumbs when limit is reached
    while (this.breadcrumbs.length > this.config.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }
  }

  clearBreadcrumbs(): void {
    this.breadcrumbs = [];
  }

  getBreadcrumbs(): Breadcrumb[] {
    return [...this.breadcrumbs];
  }

  // ─── Helpers ────────────────────────────────────────────

  /**
   * Install global unhandled error handlers (Node.js only).
   * In browsers, use window.addEventListener("error", ...) instead.
   */
  installGlobalHandler(): void {
    if (typeof process !== "undefined" && process.on) {
      process.on("uncaughtException", (err) => {
        this.captureException(err);
      });
      process.on("unhandledRejection", (reason) => {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        this.captureException(error);
      });
    }
  }

  // ─── Private ────────────────────────────────────────────

  private buildContext(extra?: Record<string, unknown>): Record<string, unknown> {
    const merged: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(this.context)) {
      merged[key] = value;
    }

    if (extra) {
      merged.extra = extra;
    }

    return merged;
  }

  private async sendReport(report: ErrorReport): Promise<boolean> {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...this.config.headers,
      };

      if (this.config.dsn) {
        headers["X-Error-Tracker-DSN"] = this.config.dsn;
      }

      const response = await fetch(this.config.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(report),
      });

      return response.ok;
    } catch {
      // Silently ignore send failures to prevent recursive error loops
      return false;
    }
  }
}

export default ErrorTracker;
