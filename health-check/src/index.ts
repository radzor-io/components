// @radzor/health-check — Health check endpoint with dependency monitoring and history

export interface HealthCheckConfig {
  intervalMs?: number;
  timeout?: number;
  historySize?: number;
}

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export interface DependencyEntry {
  name: string;
  checker: () => Promise<boolean>;
  critical: boolean;
}

export interface DependencyCheckResult {
  name: string;
  healthy: boolean;
  latencyMs: number;
  error?: string;
  checkedAt: number;
}

export interface DependencyReport {
  name: string;
  healthy: boolean;
  latencyMs: number;
  critical: boolean;
  error?: string;
  uptime: number; // percentage 0-100 based on history
}

export interface HealthReport {
  status: HealthStatus;
  dependencies: DependencyReport[];
  checkedAt: number;
  uptimeMs: number;
}

export interface HealthyPayload {
  status: string;
  checkedAt: number;
}

export interface UnhealthyPayload {
  status: string;
  failedDependencies: string[];
  checkedAt: number;
}

export type EventMap = {
  onHealthy: HealthyPayload;
  onUnhealthy: UnhealthyPayload;
};

export type Listener<T> = (event: T) => void;

// ─── Timeout utility ──────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

// ─── Class ────────────────────────────────────────────────

export class HealthChecker {
  private dependencies = new Map<string, DependencyEntry>();
  private history = new Map<string, DependencyCheckResult[]>();
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private startedAt: number;

  private intervalMs: number;
  private timeout: number;
  private historySize: number;

  constructor(config: HealthCheckConfig = {}) {
    this.intervalMs = config.intervalMs ?? 30000;
    this.timeout = config.timeout ?? 5000;
    this.historySize = config.historySize ?? 100;
    this.startedAt = Date.now();
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

  registerDependency(name: string, checker: () => Promise<boolean>, critical: boolean = true): void {
    this.dependencies.set(name, { name, checker, critical });
    this.history.set(name, []);

    // Start auto-check interval if this is the first dependency
    if (this.dependencies.size === 1 && !this.intervalTimer) {
      this.startAutoCheck();
    }
  }

  removeDependency(name: string): void {
    this.dependencies.delete(name);
    this.history.delete(name);

    if (this.dependencies.size === 0 && this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  async check(): Promise<HealthReport> {
    const checkedAt = Date.now();
    const reports: DependencyReport[] = [];
    const failedDependencies: string[] = [];

    const checkPromises = Array.from(this.dependencies.values()).map(async (dep) => {
      const result = await this.checkDependency(dep);
      this.addToHistory(dep.name, result);

      const historyEntries = this.history.get(dep.name) ?? [];
      const healthyCount = historyEntries.filter((h) => h.healthy).length;
      const uptimePercent = historyEntries.length > 0 ? (healthyCount / historyEntries.length) * 100 : 100;

      const report: DependencyReport = {
        name: dep.name,
        healthy: result.healthy,
        latencyMs: result.latencyMs,
        critical: dep.critical,
        error: result.error,
        uptime: Math.round(uptimePercent * 100) / 100,
      };

      if (!result.healthy) {
        failedDependencies.push(dep.name);
      }

      return report;
    });

    const results = await Promise.all(checkPromises);
    reports.push(...results);

    // Determine overall status
    const criticalFailures = reports.filter((r) => !r.healthy && r.critical);
    const nonCriticalFailures = reports.filter((r) => !r.healthy && !r.critical);

    let status: HealthStatus;
    if (criticalFailures.length > 0) {
      status = "unhealthy";
    } else if (nonCriticalFailures.length > 0) {
      status = "degraded";
    } else {
      status = "healthy";
    }

    const healthReport: HealthReport = {
      status,
      dependencies: reports,
      checkedAt,
      uptimeMs: Date.now() - this.startedAt,
    };

    // Emit events
    if (status === "healthy") {
      this.emit("onHealthy", { status, checkedAt });
    } else {
      this.emit("onUnhealthy", { status, failedDependencies, checkedAt });
    }

    return healthReport;
  }

  getHistory(name: string): DependencyCheckResult[] {
    return [...(this.history.get(name) ?? [])];
  }

  destroy(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  // ─── Private ────────────────────────────────────────────

  private async checkDependency(dep: DependencyEntry): Promise<DependencyCheckResult> {
    const start = Date.now();

    try {
      const healthy = await withTimeout(dep.checker(), this.timeout);
      return {
        name: dep.name,
        healthy: Boolean(healthy),
        latencyMs: Date.now() - start,
        checkedAt: Date.now(),
      };
    } catch (err) {
      return {
        name: dep.name,
        healthy: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
        checkedAt: Date.now(),
      };
    }
  }

  private addToHistory(name: string, result: DependencyCheckResult): void {
    const entries = this.history.get(name);
    if (!entries) return;

    entries.push(result);
    while (entries.length > this.historySize) {
      entries.shift();
    }
  }

  private startAutoCheck(): void {
    this.intervalTimer = setInterval(() => {
      this.check();
    }, this.intervalMs);

    if (this.intervalTimer.unref) {
      this.intervalTimer.unref();
    }
  }
}

export default HealthChecker;
