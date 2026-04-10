// @radzor/retry-handler — Retry failed operations with configurable backoff strategies

export interface RetryConfig {
  maxAttempts: number;
  strategy: "exponential" | "linear" | "fixed";
  baseDelay: number;
  maxDelay: number;
  jitter: boolean;
  retryOn?: (error: Error) => boolean;
}

export interface RetryResult<T> {
  success: boolean;
  data: T | undefined;
  attempts: number;
  lastError: Error | null;
  totalTime: number;
  delays: number[];
}

export interface RetryStats {
  totalExecutions: number;
  totalSuccesses: number;
  totalFailures: number;
  totalRetries: number;
  averageAttempts: number;
  averageTime: number;
}

export type EventMap = {
  onRetry: { attempt: number; delay: number; error: string; elapsed: number };
  onExhausted: { attempts: number; lastError: string; totalTime: number };
  onSuccess: { attempt: number; totalTime: number };
};

type Listener<T> = (event: T) => void;

export class RetryHandler {
  private config: RetryConfig;
  private stats: RetryStats = {
    totalExecutions: 0,
    totalSuccesses: 0,
    totalFailures: 0,
    totalRetries: 0,
    averageAttempts: 0,
    averageTime: 0,
  };
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = {
      maxAttempts: config.maxAttempts ?? 3,
      strategy: config.strategy ?? "exponential",
      baseDelay: config.baseDelay ?? 1000,
      maxDelay: config.maxDelay ?? 30000,
      jitter: config.jitter ?? true,
      retryOn: config.retryOn,
    };
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]!.push(listener);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const list = this.listeners[event];
    if (list) this.listeners[event] = list.filter((l) => l !== listener) as typeof list;
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const list = this.listeners[event];
    if (list) list.forEach((l) => l(payload));
  }

  configure(options: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...options };
  }

  private computeDelay(attempt: number): number {
    let delay: number;

    switch (this.config.strategy) {
      case "exponential":
        delay = this.config.baseDelay * Math.pow(2, attempt - 1);
        break;
      case "linear":
        delay = this.config.baseDelay * attempt;
        break;
      case "fixed":
        delay = this.config.baseDelay;
        break;
      default:
        delay = this.config.baseDelay;
    }

    delay = Math.min(delay, this.config.maxDelay);

    if (this.config.jitter) {
      const jitterRange = delay * 0.25;
      delay = delay + (Math.random() * jitterRange * 2 - jitterRange);
      delay = Math.max(0, Math.round(delay));
    }

    return delay;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async execute<T>(fn: () => Promise<T>): Promise<RetryResult<T>> {
    const startTime = Date.now();
    let lastError: Error | null = null;
    const delays: number[] = [];
    let attempt = 0;

    this.stats.totalExecutions++;

    for (attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        const data = await fn();
        const totalTime = Date.now() - startTime;

        this.stats.totalSuccesses++;
        this.updateAverages(attempt, totalTime);
        this.emit("onSuccess", { attempt, totalTime });

        return {
          success: true,
          data,
          attempts: attempt,
          lastError: null,
          totalTime,
          delays,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (this.config.retryOn && !this.config.retryOn(lastError)) {
          break;
        }

        if (attempt < this.config.maxAttempts) {
          const delay = this.computeDelay(attempt);
          delays.push(delay);
          this.stats.totalRetries++;

          this.emit("onRetry", {
            attempt,
            delay,
            error: lastError.message,
            elapsed: Date.now() - startTime,
          });

          await this.sleep(delay);
        }
      }
    }

    const totalTime = Date.now() - startTime;
    this.stats.totalFailures++;
    this.updateAverages(attempt - 1, totalTime);

    this.emit("onExhausted", {
      attempts: attempt - 1,
      lastError: lastError?.message ?? "Unknown error",
      totalTime,
    });

    return {
      success: false,
      data: undefined,
      attempts: attempt - 1,
      lastError,
      totalTime,
      delays,
    };
  }

  private updateAverages(attempts: number, time: number): void {
    const total = this.stats.totalSuccesses + this.stats.totalFailures;
    this.stats.averageAttempts =
      (this.stats.averageAttempts * (total - 1) + attempts) / total;
    this.stats.averageTime =
      (this.stats.averageTime * (total - 1) + time) / total;
  }

  getStats(): Readonly<RetryStats> {
    return { ...this.stats };
  }

  reset(): void {
    this.stats = {
      totalExecutions: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      totalRetries: 0,
      averageAttempts: 0,
      averageTime: 0,
    };
  }
}

export default RetryHandler;
