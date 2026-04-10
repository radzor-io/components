// @radzor/cache-store — In-memory cache with TTL and LRU eviction

// ---- types ----

export interface CacheConfig {
  maxSize?: number;
  defaultTtl?: number; // ms, 0 = no expiry
}

export interface CacheEntry<T> {
  value: T;
  expiresAt: number; // 0 = no expiry
  lastAccessed: number;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
}

export type EventMap = {
  onHit: { key: string };
  onMiss: { key: string };
  onEvicted: { key: string; reason: "ttl" | "lru" | "manual" };
  onError: { code: string; message: string };
};

// ---- implementation ----

export class CacheStore<T = unknown> {
  private store: Map<string, CacheEntry<T>> = new Map();
  private maxSize: number;
  private defaultTtl: number;
  private stats = { hits: 0, misses: 0, evictions: 0 };
  private listeners: { [K in keyof EventMap]?: Array<(payload: EventMap[K]) => void> } = {};

  constructor(config: CacheConfig = {}) {
    this.maxSize = config.maxSize ?? 1000;
    this.defaultTtl = config.defaultTtl ?? 0;
  }

  on<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void): void {
    (this.listeners[event] ??= []).push(listener);
  }

  off<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void): void {
    const arr = this.listeners[event];
    if (arr) this.listeners[event] = arr.filter((l) => l !== listener) as any;
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    this.listeners[event]?.forEach((l) => l(payload));
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);

    if (!entry) {
      this.stats.misses++;
      this.emit("onMiss", { key });
      return undefined;
    }

    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.stats.misses++;
      this.stats.evictions++;
      this.emit("onEvicted", { key, reason: "ttl" });
      this.emit("onMiss", { key });
      return undefined;
    }

    entry.lastAccessed = Date.now();
    this.stats.hits++;
    this.emit("onHit", { key });
    return entry.value;
  }

  set(key: string, value: T, ttl?: number): void {
    const effectiveTtl = ttl ?? this.defaultTtl;

    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      this.evictLru();
    }

    this.store.set(key, {
      value,
      expiresAt: effectiveTtl > 0 ? Date.now() + effectiveTtl : 0,
      lastAccessed: Date.now(),
    });
  }

  delete(key: string): boolean {
    const existed = this.store.delete(key);
    if (existed) {
      this.emit("onEvicted", { key, reason: "manual" });
    }
    return existed;
  }

  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  clear(): void {
    this.store.clear();
  }

  getStats(): CacheStats {
    return { size: this.store.size, ...this.stats };
  }

  keys(): string[] {
    return [...this.store.keys()];
  }

  getOrSet(key: string, factory: () => T, ttl?: number): T {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    try {
      const value = factory();
      this.set(key, value, ttl);
      return value;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "FACTORY_ERROR", message });
      throw err;
    }
  }

  async getOrSetAsync(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    try {
      const value = await factory();
      this.set(key, value, ttl);
      return value;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "FACTORY_ERROR", message });
      throw err;
    }
  }

  private evictLru(): void {
    let oldest: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.store) {
      // Also evict expired entries
      if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
        this.store.delete(key);
        this.stats.evictions++;
        this.emit("onEvicted", { key, reason: "ttl" });
        return;
      }
      if (entry.lastAccessed < oldestTime) {
        oldest = key;
        oldestTime = entry.lastAccessed;
      }
    }

    if (oldest) {
      this.store.delete(oldest);
      this.stats.evictions++;
      this.emit("onEvicted", { key: oldest, reason: "lru" });
    }
  }
}
