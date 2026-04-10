// @radzor/kv-store — Key-value store with TTL support (in-memory or Redis)

import * as net from "net";

// ---- types ----

export interface KvStoreConfig {
  mode?: "memory" | "redis";
  redisUrl?: string;
  namespace?: string;
  defaultTtl?: number;
}

export interface KvEntry {
  value: string;
  expiresAt: number; // 0 = no expiry
}

export interface StoreStats {
  size: number;
  mode: string;
  namespace: string;
}

export type EventMap = {
  onExpired: { key: string; value: string };
};

type Listener<T> = (payload: T) => void;

// ---- Redis RESP protocol ----

function encodeResp(args: string[]): string {
  let out = `*${args.length}\r\n`;
  for (const arg of args) {
    out += `$${Buffer.byteLength(arg)}\r\n${arg}\r\n`;
  }
  return out;
}

function parseRespLine(data: string): { value: string | null; lines: number } {
  const lines = data.split("\r\n");
  if (lines.length === 0) return { value: null, lines: 0 };

  const first = lines[0];
  if (first.startsWith("+")) return { value: first.slice(1), lines: 1 };
  if (first.startsWith("-")) throw new Error(`Redis error: ${first.slice(1)}`);
  if (first.startsWith(":")) return { value: first.slice(1), lines: 1 };
  if (first.startsWith("$")) {
    const len = parseInt(first.slice(1));
    if (len === -1) return { value: null, lines: 1 };
    return { value: lines[1] ?? "", lines: 2 };
  }
  if (first.startsWith("*")) {
    const count = parseInt(first.slice(1));
    if (count === -1) return { value: null, lines: 1 };
    // For simplicity, return concatenated values
    const values: string[] = [];
    let lineIdx = 1;
    for (let i = 0; i < count; i++) {
      const line = lines[lineIdx];
      if (line?.startsWith("$")) {
        const len = parseInt(line.slice(1));
        lineIdx++;
        if (len === -1) {
          values.push("");
        } else {
          values.push(lines[lineIdx] ?? "");
          lineIdx++;
        }
      }
    }
    return { value: JSON.stringify(values), lines: lineIdx };
  }
  return { value: first, lines: 1 };
}

class RedisClient {
  private socket: net.Socket | null = null;
  private host: string;
  private port: number;
  private password: string;
  private db: number;
  private connected = false;
  private responseQueue: Array<{
    resolve: (v: string | null) => void;
    reject: (e: Error) => void;
  }> = [];
  private buffer = "";

  constructor(url: string) {
    const u = new URL(url);
    this.host = u.hostname || "127.0.0.1";
    this.port = parseInt(u.port || "6379");
    this.password = u.password ? decodeURIComponent(u.password) : "";
    this.db = parseInt(u.pathname?.slice(1) || "0");
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(this.port, this.host);

      this.socket.on("connect", async () => {
        this.connected = true;
        this.socket!.on("data", (chunk) => this.handleData(chunk.toString()));

        try {
          if (this.password) await this.command("AUTH", this.password);
          if (this.db > 0) await this.command("SELECT", String(this.db));
          resolve();
        } catch (err) {
          reject(err);
        }
      });

      this.socket.on("error", (err) => {
        if (!this.connected) reject(err);
      });
    });
  }

  private handleData(data: string): void {
    this.buffer += data;

    while (this.buffer.length > 0 && this.responseQueue.length > 0) {
      try {
        const result = parseRespLine(this.buffer);
        // Find the complete message boundary
        const lines = this.buffer.split("\r\n");
        let consumed = 0;
        for (let i = 0; i < result.lines; i++) {
          consumed += (lines[i]?.length ?? 0) + 2;
        }
        this.buffer = this.buffer.slice(consumed);

        const handler = this.responseQueue.shift();
        handler?.resolve(result.value);
      } catch (err) {
        const handler = this.responseQueue.shift();
        handler?.reject(err instanceof Error ? err : new Error(String(err)));
        break;
      }
    }
  }

  async command(...args: string[]): Promise<string | null> {
    if (!this.socket || !this.connected) throw new Error("Not connected");

    return new Promise((resolve, reject) => {
      this.responseQueue.push({ resolve, reject });
      this.socket!.write(encodeResp(args));
    });
  }

  close(): void {
    this.socket?.end();
    this.connected = false;
  }
}

// ---- implementation ----

export class KvStore {
  private mode: "memory" | "redis";
  private namespace: string;
  private defaultTtl: number;
  private memStore: Map<string, KvEntry> = new Map();
  private redis: RedisClient | null = null;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private listeners: { [K in keyof EventMap]?: Array<Listener<EventMap[K]>> } = {};

  constructor(config: KvStoreConfig = {}) {
    this.mode = config.mode ?? "memory";
    this.namespace = config.namespace ?? "";
    this.defaultTtl = config.defaultTtl ?? 0;

    if (this.mode === "redis") {
      if (!config.redisUrl) throw new Error("redisUrl is required for redis mode");
      this.redis = new RedisClient(config.redisUrl);
    } else {
      // Periodic sweep for expired keys in memory mode
      this.sweepTimer = setInterval(() => this.sweep(), 5000);
    }
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    (this.listeners[event] ??= []).push(listener);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const arr = this.listeners[event];
    if (arr) this.listeners[event] = arr.filter((l) => l !== listener) as any;
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    this.listeners[event]?.forEach((l) => l(payload));
  }

  private prefixKey(key: string): string {
    return this.namespace ? `${this.namespace}:${key}` : key;
  }

  private unprefixKey(key: string): string {
    if (this.namespace && key.startsWith(this.namespace + ":")) {
      return key.slice(this.namespace.length + 1);
    }
    return key;
  }

  async connect(): Promise<void> {
    if (this.redis) await this.redis.connect();
  }

  async get(key: string): Promise<string | null> {
    if (this.mode === "redis" && this.redis) {
      const result = await this.redis.command("GET", this.prefixKey(key));
      return result;
    }

    const pk = this.prefixKey(key);
    const entry = this.memStore.get(pk);
    if (!entry) return null;

    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.memStore.delete(pk);
      this.emit("onExpired", { key, value: entry.value });
      return null;
    }

    return entry.value;
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    const effectiveTtl = ttl ?? this.defaultTtl;

    if (this.mode === "redis" && this.redis) {
      const pk = this.prefixKey(key);
      if (effectiveTtl > 0) {
        const pxMs = String(effectiveTtl);
        await this.redis.command("SET", pk, value, "PX", pxMs);
      } else {
        await this.redis.command("SET", pk, value);
      }
      return;
    }

    const pk = this.prefixKey(key);
    this.memStore.set(pk, {
      value,
      expiresAt: effectiveTtl > 0 ? Date.now() + effectiveTtl : 0,
    });
  }

  async delete(key: string): Promise<boolean> {
    if (this.mode === "redis" && this.redis) {
      const result = await this.redis.command("DEL", this.prefixKey(key));
      return result === "1";
    }

    return this.memStore.delete(this.prefixKey(key));
  }

  async has(key: string): Promise<boolean> {
    if (this.mode === "redis" && this.redis) {
      const result = await this.redis.command("EXISTS", this.prefixKey(key));
      return result === "1";
    }

    const pk = this.prefixKey(key);
    const entry = this.memStore.get(pk);
    if (!entry) return false;
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.memStore.delete(pk);
      this.emit("onExpired", { key, value: entry.value });
      return false;
    }
    return true;
  }

  async keys(pattern?: string): Promise<string[]> {
    if (this.mode === "redis" && this.redis) {
      const rPattern = this.prefixKey(pattern ?? "*");
      const result = await this.redis.command("KEYS", rPattern);
      if (!result) return [];
      try {
        const arr: string[] = JSON.parse(result);
        return arr.map((k) => this.unprefixKey(k));
      } catch {
        return [];
      }
    }

    const glob = pattern ?? "*";
    const regex = new RegExp(
      "^" +
        glob
          .replace(/[.+^${}()|[\]\\]/g, "\\$&")
          .replace(/\*/g, ".*")
          .replace(/\?/g, ".") +
        "$"
    );

    const result: string[] = [];
    const now = Date.now();

    for (const [pk, entry] of this.memStore) {
      if (entry.expiresAt > 0 && now > entry.expiresAt) {
        this.memStore.delete(pk);
        this.emit("onExpired", { key: this.unprefixKey(pk), value: entry.value });
        continue;
      }
      const unprefixed = this.unprefixKey(pk);
      if (regex.test(unprefixed)) {
        result.push(unprefixed);
      }
    }

    return result;
  }

  async clear(): Promise<void> {
    if (this.mode === "redis" && this.redis) {
      const allKeys = await this.keys("*");
      for (const key of allKeys) {
        await this.redis.command("DEL", this.prefixKey(key));
      }
      return;
    }

    if (this.namespace) {
      const prefix = this.namespace + ":";
      for (const key of this.memStore.keys()) {
        if (key.startsWith(prefix)) this.memStore.delete(key);
      }
    } else {
      this.memStore.clear();
    }
  }

  getStats(): StoreStats {
    return {
      size: this.memStore.size,
      mode: this.mode,
      namespace: this.namespace,
    };
  }

  destroy(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    if (this.redis) {
      this.redis.close();
      this.redis = null;
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const [pk, entry] of this.memStore) {
      if (entry.expiresAt > 0 && now > entry.expiresAt) {
        this.memStore.delete(pk);
        this.emit("onExpired", { key: this.unprefixKey(pk), value: entry.value });
      }
    }
  }
}

export default KvStore;
