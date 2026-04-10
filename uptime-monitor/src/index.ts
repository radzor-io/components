// @radzor/uptime-monitor — Monitor URL uptime with intervals, latency tracking, and alerts

export interface UptimeMonitorConfig {
  intervalMs?: number;
  timeout?: number;
  latencyThresholdMs?: number;
  headers?: Record<string, string>;
}

export type TargetStatus = "up" | "down" | "unknown";

export interface MonitorTarget {
  url: string;
  name: string;
  intervalMs: number;
  timer: ReturnType<typeof setInterval> | null;
  paused: boolean;
  status: TargetStatus;
  latencyMs: number;
  lastChecked: number;
  consecutiveFailures: number;
  totalChecks: number;
  successfulChecks: number;
  downSince: number | null;
}

export interface UptimeReport {
  url: string;
  name: string;
  status: TargetStatus;
  latencyMs: number;
  uptimePercent: number;
  lastChecked: number;
  consecutiveFailures: number;
  totalChecks: number;
}

export interface DownPayload {
  url: string;
  error: string;
  consecutiveFailures: number;
  timestamp: number;
}

export interface RecoveredPayload {
  url: string;
  downtimeMs: number;
  timestamp: number;
}

export interface LatencySpikePayload {
  url: string;
  latencyMs: number;
  threshold: number;
  timestamp: number;
}

export type EventMap = {
  onDown: DownPayload;
  onRecovered: RecoveredPayload;
  onLatencySpike: LatencySpikePayload;
};

export type Listener<T> = (event: T) => void;

// ─── Timeout-wrapped fetch ────────────────────────────────

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  headers: Record<string, string>,
): Promise<{ ok: boolean; status: number; latencyMs: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
      redirect: "follow",
    });

    const latencyMs = Date.now() - start;
    clearTimeout(timer);

    return {
      ok: response.status < 500,
      status: response.status,
      latencyMs,
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - start,
    };
  }
}

// ─── Class ────────────────────────────────────────────────

export class UptimeMonitor {
  private defaultIntervalMs: number;
  private timeout: number;
  private latencyThresholdMs: number;
  private defaultHeaders: Record<string, string>;
  private targets = new Map<string, MonitorTarget>();
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: UptimeMonitorConfig = {}) {
    this.defaultIntervalMs = config.intervalMs ?? 60000;
    this.timeout = config.timeout ?? 10000;
    this.latencyThresholdMs = config.latencyThresholdMs ?? 2000;
    this.defaultHeaders = config.headers ?? {};
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

  addTarget(url: string, name?: string, intervalMs?: number): void {
    if (this.targets.has(url)) {
      return; // already monitoring
    }

    const target: MonitorTarget = {
      url,
      name: name ?? url,
      intervalMs: intervalMs ?? this.defaultIntervalMs,
      timer: null,
      paused: false,
      status: "unknown",
      latencyMs: 0,
      lastChecked: 0,
      consecutiveFailures: 0,
      totalChecks: 0,
      successfulChecks: 0,
      downSince: null,
    };

    this.targets.set(url, target);
    this.startChecking(target);

    // Run an initial check immediately
    this.performCheck(target);
  }

  removeTarget(url: string): void {
    const target = this.targets.get(url);
    if (target) {
      if (target.timer) {
        clearInterval(target.timer);
      }
      this.targets.delete(url);
    }
  }

  getStatus(url?: string): UptimeReport | UptimeReport[] {
    if (url) {
      const target = this.targets.get(url);
      if (!target) {
        throw new Error(`Target "${url}" not found`);
      }
      return this.buildReport(target);
    }

    return Array.from(this.targets.values()).map((t) => this.buildReport(t));
  }

  pause(url?: string): void {
    if (url) {
      const target = this.targets.get(url);
      if (target) {
        target.paused = true;
        if (target.timer) {
          clearInterval(target.timer);
          target.timer = null;
        }
      }
    } else {
      for (const target of this.targets.values()) {
        target.paused = true;
        if (target.timer) {
          clearInterval(target.timer);
          target.timer = null;
        }
      }
    }
  }

  resume(url?: string): void {
    if (url) {
      const target = this.targets.get(url);
      if (target && target.paused) {
        target.paused = false;
        this.startChecking(target);
        this.performCheck(target);
      }
    } else {
      for (const target of this.targets.values()) {
        if (target.paused) {
          target.paused = false;
          this.startChecking(target);
          this.performCheck(target);
        }
      }
    }
  }

  destroy(): void {
    for (const target of this.targets.values()) {
      if (target.timer) {
        clearInterval(target.timer);
      }
    }
    this.targets.clear();
  }

  getTargetUrls(): string[] {
    return Array.from(this.targets.keys());
  }

  // ─── Private ────────────────────────────────────────────

  private startChecking(target: MonitorTarget): void {
    if (target.timer) {
      clearInterval(target.timer);
    }

    target.timer = setInterval(() => {
      if (!target.paused) {
        this.performCheck(target);
      }
    }, target.intervalMs);

    if (target.timer.unref) {
      target.timer.unref();
    }
  }

  private async performCheck(target: MonitorTarget): Promise<void> {
    const result = await fetchWithTimeout(target.url, this.timeout, this.defaultHeaders);
    const now = Date.now();

    target.totalChecks++;
    target.lastChecked = now;
    target.latencyMs = result.latencyMs;

    const previousStatus = target.status;

    if (result.ok) {
      target.status = "up";
      target.successfulChecks++;

      // Recovery detection
      if (previousStatus === "down" && target.downSince) {
        const downtimeMs = now - target.downSince;
        this.emit("onRecovered", { url: target.url, downtimeMs, timestamp: now });
        target.downSince = null;
      }

      target.consecutiveFailures = 0;

      // Latency spike detection
      if (result.latencyMs > this.latencyThresholdMs) {
        this.emit("onLatencySpike", {
          url: target.url,
          latencyMs: result.latencyMs,
          threshold: this.latencyThresholdMs,
          timestamp: now,
        });
      }
    } else {
      target.status = "down";
      target.consecutiveFailures++;

      // First failure — mark downSince
      if (previousStatus !== "down") {
        target.downSince = now;
      }

      this.emit("onDown", {
        url: target.url,
        error: result.status > 0 ? `HTTP ${result.status}` : "Connection failed",
        consecutiveFailures: target.consecutiveFailures,
        timestamp: now,
      });
    }
  }

  private buildReport(target: MonitorTarget): UptimeReport {
    const uptimePercent =
      target.totalChecks > 0
        ? Math.round((target.successfulChecks / target.totalChecks) * 10000) / 100
        : 100;

    return {
      url: target.url,
      name: target.name,
      status: target.status,
      latencyMs: target.latencyMs,
      uptimePercent,
      lastChecked: target.lastChecked,
      consecutiveFailures: target.consecutiveFailures,
      totalChecks: target.totalChecks,
    };
  }
}

export default UptimeMonitor;
