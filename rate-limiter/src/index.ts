// @radzor/rate-limiter — In-memory rate limiting with token bucket and sliding window algorithms

export type Algorithm = "token-bucket" | "sliding-window";

export interface RateLimiterConfig {
  algorithm: Algorithm;
  maxRequests: number;
  windowMs: number;
  keyPrefix?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
}

export interface RateLimitEvent {
  key: string;
  remaining: number;
}

export interface RateLimitError {
  code: string;
  message: string;
  key: string;
  retryAfterMs: number;
}

export type EventMap = {
  onAllowed: RateLimitEvent;
  onBlocked: RateLimitError;
  onError: { code: string; message: string };
};

export type Listener<T> = (event: T) => void;

export interface TokenBucketEntry {
  tokens: number;
  lastRefill: number;
}

export interface SlidingWindowEntry {
  timestamps: number[];
}

export class RateLimiter {
  private config: RateLimiterConfig;
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  // In-memory stores
  private tokenBuckets = new Map<string, TokenBucketEntry>();
  private slidingWindows = new Map<string, SlidingWindowEntry>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(config: RateLimiterConfig) {
    if (config.maxRequests <= 0) {
      throw new Error("maxRequests must be greater than 0");
    }
    if (config.windowMs <= 0) {
      throw new Error("windowMs must be greater than 0");
    }

    this.config = config;

    // Periodic cleanup to prevent memory leaks
    this.cleanupInterval = setInterval(() => this.cleanup(), config.windowMs * 2);
    if (this.cleanupInterval.unref) this.cleanupInterval.unref();
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]!.push(listener);
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const list = this.listeners[event];
    if (list) list.forEach((l) => l(payload));
  }

  /** Check if a request is allowed for the given key. */
  check(key: string): RateLimitResult {
    const fullKey = this.config.keyPrefix ? `${this.config.keyPrefix}:${key}` : key;

    switch (this.config.algorithm) {
      case "token-bucket":
        return this.checkTokenBucket(fullKey);
      case "sliding-window":
        return this.checkSlidingWindow(fullKey);
    }
  }

  /** Consume a token and return the result. Emits onAllowed or onBlocked. */
  consume(key: string): RateLimitResult {
    const fullKey = this.config.keyPrefix ? `${this.config.keyPrefix}:${key}` : key;

    let result: RateLimitResult;
    switch (this.config.algorithm) {
      case "token-bucket":
        result = this.consumeTokenBucket(fullKey);
        break;
      case "sliding-window":
        result = this.consumeSlidingWindow(fullKey);
        break;
    }

    if (result.allowed) {
      this.emit("onAllowed", { key: fullKey, remaining: result.remaining });
    } else {
      this.emit("onBlocked", {
        code: "RATE_LIMITED",
        message: `Rate limit exceeded for key "${key}". Retry after ${result.retryAfterMs}ms.`,
        key: fullKey,
        retryAfterMs: result.retryAfterMs,
      });
    }

    return result;
  }

  /** Reset the rate limit for a specific key. */
  reset(key: string): void {
    const fullKey = this.config.keyPrefix ? `${this.config.keyPrefix}:${key}` : key;
    this.tokenBuckets.delete(fullKey);
    this.slidingWindows.delete(fullKey);
  }

  /** Get headers suitable for HTTP responses. */
  getHeaders(result: RateLimitResult): Record<string, string> {
    return {
      "X-RateLimit-Limit": String(this.config.maxRequests),
      "X-RateLimit-Remaining": String(result.remaining),
      "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
      ...(result.allowed ? {} : { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) }),
    };
  }

  /** Stop the cleanup interval. Call this when done. */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.tokenBuckets.clear();
    this.slidingWindows.clear();
  }

  // ─── Token Bucket ────────────────────────────────────────

  private checkTokenBucket(key: string): RateLimitResult {
    const entry = this.getOrCreateBucket(key);
    this.refillBucket(entry);

    return {
      allowed: entry.tokens > 0,
      remaining: Math.max(0, Math.floor(entry.tokens)),
      resetAt: entry.lastRefill + this.config.windowMs,
      retryAfterMs: entry.tokens > 0 ? 0 : this.timeToNextToken(entry),
    };
  }

  private consumeTokenBucket(key: string): RateLimitResult {
    const entry = this.getOrCreateBucket(key);
    this.refillBucket(entry);

    if (entry.tokens >= 1) {
      entry.tokens -= 1;
      return {
        allowed: true,
        remaining: Math.max(0, Math.floor(entry.tokens)),
        resetAt: entry.lastRefill + this.config.windowMs,
        retryAfterMs: 0,
      };
    }

    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.lastRefill + this.config.windowMs,
      retryAfterMs: this.timeToNextToken(entry),
    };
  }

  private getOrCreateBucket(key: string): TokenBucketEntry {
    let entry = this.tokenBuckets.get(key);
    if (!entry) {
      entry = { tokens: this.config.maxRequests, lastRefill: Date.now() };
      this.tokenBuckets.set(key, entry);
    }
    return entry;
  }

  private refillBucket(entry: TokenBucketEntry): void {
    const now = Date.now();
    const elapsed = now - entry.lastRefill;
    const refillRate = this.config.maxRequests / this.config.windowMs;
    const tokensToAdd = elapsed * refillRate;

    entry.tokens = Math.min(this.config.maxRequests, entry.tokens + tokensToAdd);
    entry.lastRefill = now;
  }

  private timeToNextToken(entry: TokenBucketEntry): number {
    const refillRate = this.config.maxRequests / this.config.windowMs;
    return Math.ceil((1 - entry.tokens) / refillRate);
  }

  // ─── Sliding Window ──────────────────────────────────────

  private checkSlidingWindow(key: string): RateLimitResult {
    const entry = this.getOrCreateWindow(key);
    this.pruneWindow(entry);

    const remaining = Math.max(0, this.config.maxRequests - entry.timestamps.length);
    const oldest = entry.timestamps[0];
    const resetAt = oldest ? oldest + this.config.windowMs : Date.now() + this.config.windowMs;
    const retryAfterMs = remaining > 0 ? 0 : (oldest ? oldest + this.config.windowMs - Date.now() : 0);

    return {
      allowed: remaining > 0,
      remaining,
      resetAt,
      retryAfterMs: Math.max(0, retryAfterMs),
    };
  }

  private consumeSlidingWindow(key: string): RateLimitResult {
    const entry = this.getOrCreateWindow(key);
    this.pruneWindow(entry);

    if (entry.timestamps.length < this.config.maxRequests) {
      entry.timestamps.push(Date.now());
      return {
        allowed: true,
        remaining: this.config.maxRequests - entry.timestamps.length,
        resetAt: entry.timestamps[0] + this.config.windowMs,
        retryAfterMs: 0,
      };
    }

    const oldest = entry.timestamps[0];
    const retryAfterMs = oldest + this.config.windowMs - Date.now();

    return {
      allowed: false,
      remaining: 0,
      resetAt: oldest + this.config.windowMs,
      retryAfterMs: Math.max(0, retryAfterMs),
    };
  }

  private getOrCreateWindow(key: string): SlidingWindowEntry {
    let entry = this.slidingWindows.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.slidingWindows.set(key, entry);
    }
    return entry;
  }

  private pruneWindow(entry: SlidingWindowEntry): void {
    const cutoff = Date.now() - this.config.windowMs;
    while (entry.timestamps.length > 0 && entry.timestamps[0] <= cutoff) {
      entry.timestamps.shift();
    }
  }

  // ─── Cleanup ─────────────────────────────────────────────

  private cleanup(): void {
    const now = Date.now();

    // Clean stale token buckets
    for (const [key, entry] of this.tokenBuckets) {
      if (now - entry.lastRefill > this.config.windowMs * 2) {
        this.tokenBuckets.delete(key);
      }
    }

    // Clean stale sliding windows
    for (const [key, entry] of this.slidingWindows) {
      this.pruneWindow(entry);
      if (entry.timestamps.length === 0) {
        this.slidingWindows.delete(key);
      }
    }
  }
}

export default RateLimiter;
