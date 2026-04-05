// @radzor/circuit-breaker — In-memory circuit breaker state machine

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerConfig {
  threshold?: number;
  timeout?: number;
  halfOpenRequests?: number;
  volumeThreshold?: number;
}

export interface CircuitMetrics {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  rejectedCount: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
}

export interface StateChangeEvent {
  from: CircuitState;
  to: CircuitState;
  timestamp: number;
}

export interface RejectedEvent {
  state: CircuitState;
  timestamp: number;
}

export interface CircuitError {
  code: string;
  message: string;
  originalError?: unknown;
}

type EventMap = {
  onOpen: StateChangeEvent;
  onHalfOpen: StateChangeEvent;
  onClose: StateChangeEvent;
  onRejected: RejectedEvent;
  onError: CircuitError;
};

type Listener<T> = (event: T) => void;

export class CircuitOpenError extends Error {
  constructor(public readonly state: CircuitState) {
    super(`Circuit is ${state}. Request rejected.`);
    this.name = "CircuitOpenError";
  }
}

export class CircuitBreaker {
  private config: Required<CircuitBreakerConfig>;
  private state: CircuitState = "closed";
  private failures = 0;
  private halfOpenSuccesses = 0;
  private halfOpenAttempts = 0;
  private openedAt: number | null = null;
  private metrics: CircuitMetrics = {
    totalRequests: 0,
    successCount: 0,
    failureCount: 0,
    rejectedCount: 0,
    lastFailureTime: null,
    lastSuccessTime: null,
  };
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: CircuitBreakerConfig = {}) {
    this.config = {
      threshold: config.threshold ?? 5,
      timeout: config.timeout ?? 60000,
      halfOpenRequests: config.halfOpenRequests ?? 1,
      volumeThreshold: config.volumeThreshold ?? 10,
    };
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

  private transitionTo(next: CircuitState): void {
    const from = this.state;
    this.state = next;

    const event: StateChangeEvent = { from, to: next, timestamp: Date.now() };

    if (next === "open") {
      this.openedAt = Date.now();
      this.emit("onOpen", event);
    } else if (next === "half-open") {
      this.halfOpenSuccesses = 0;
      this.halfOpenAttempts = 0;
      this.emit("onHalfOpen", event);
    } else if (next === "closed") {
      this.failures = 0;
      this.openedAt = null;
      this.emit("onClose", event);
    }
  }

  private checkHalfOpen(): void {
    if (
      this.state === "open" &&
      this.openedAt !== null &&
      Date.now() - this.openedAt >= this.config.timeout
    ) {
      this.transitionTo("half-open");
    }
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.checkHalfOpen();

    if (this.state === "open") {
      this.metrics.rejectedCount++;
      this.metrics.totalRequests++;
      this.emit("onRejected", { state: this.state, timestamp: Date.now() });
      throw new CircuitOpenError(this.state);
    }

    if (this.state === "half-open" && this.halfOpenAttempts >= this.config.halfOpenRequests) {
      this.metrics.rejectedCount++;
      this.metrics.totalRequests++;
      this.emit("onRejected", { state: this.state, timestamp: Date.now() });
      throw new CircuitOpenError(this.state);
    }

    this.metrics.totalRequests++;
    if (this.state === "half-open") {
      this.halfOpenAttempts++;
    }

    try {
      const result = await fn();

      this.metrics.successCount++;
      this.metrics.lastSuccessTime = Date.now();

      if (this.state === "half-open") {
        this.halfOpenSuccesses++;
        if (this.halfOpenSuccesses >= this.config.halfOpenRequests) {
          this.transitionTo("closed");
        }
      } else {
        // In closed state: a success resets failure count
        this.failures = 0;
      }

      return result;
    } catch (err) {
      this.metrics.failureCount++;
      this.metrics.lastFailureTime = Date.now();
      this.failures++;

      this.emit("onError", {
        code: "EXECUTION_ERROR",
        message: err instanceof Error ? err.message : String(err),
        originalError: err,
      });

      if (this.state === "half-open") {
        // Any failure in half-open sends back to open
        this.transitionTo("open");
      } else if (
        this.state === "closed" &&
        this.metrics.totalRequests >= this.config.volumeThreshold &&
        this.failures >= this.config.threshold
      ) {
        this.transitionTo("open");
      }

      throw err;
    }
  }

  getState(): CircuitState {
    this.checkHalfOpen();
    return this.state;
  }

  getMetrics(): Readonly<CircuitMetrics> {
    return { ...this.metrics };
  }

  reset(): void {
    this.state = "closed";
    this.failures = 0;
    this.halfOpenSuccesses = 0;
    this.halfOpenAttempts = 0;
    this.openedAt = null;
    this.metrics = {
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      rejectedCount: 0,
      lastFailureTime: null,
      lastSuccessTime: null,
    };
  }
}

export default CircuitBreaker;
