// @radzor/session-manager — Secure session management with HMAC-signed cookies
// Memory store is fully implemented. Redis/Postgres stores require ioredis / pg packages.

import * as crypto from "crypto";

export type StoreType = "memory" | "redis" | "postgres";

export interface SessionManagerConfig {
  store?: StoreType;
  connection?: unknown;  // ioredis client or pg Pool for redis/postgres stores
  secret: string;        // Required: HMAC signing secret (min 32 chars recommended)
  ttl?: number;          // Session TTL in seconds (default: 86400 = 24h)
  cookieName?: string;   // Cookie name (default: 'sid')
  secure?: boolean;      // Set Secure flag on cookie (default: true)
}

export interface SessionCookieResult {
  sessionId: string;
  cookie: string;
}

export interface CreatedEvent {
  sessionId: string;
}

export interface DestroyedEvent {
  sessionId: string;
}

export interface ExpiredEvent {
  sessionId: string;
}

export interface ErrorEvent {
  code: string;
  message: string;
}

type EventMap = {
  onCreated: CreatedEvent;
  onDestroyed: DestroyedEvent;
  onExpired: ExpiredEvent;
  onError: ErrorEvent;
};

type Listener<T> = (event: T) => void;

interface MemoryEntry {
  data: Record<string, unknown>;
  expiresAt: number;
}

// ─── Store Interface ──────────────────────────────────────────────────────────

interface SessionStore {
  get(sessionId: string): Promise<Record<string, unknown> | null>;
  set(sessionId: string, data: Record<string, unknown>, ttlSeconds: number): Promise<void>;
  destroy(sessionId: string): Promise<void>;
  close(): Promise<void>;
}

// ─── Memory Store ─────────────────────────────────────────────────────────────

class MemoryStore implements SessionStore {
  private store = new Map<string, MemoryEntry>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(ttlSeconds: number) {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    if (this.cleanupInterval.unref) this.cleanupInterval.unref();
  }

  async get(sessionId: string): Promise<Record<string, unknown> | null> {
    const entry = this.store.get(sessionId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(sessionId);
      return null;
    }
    return entry.data;
  }

  async set(sessionId: string, data: Record<string, unknown>, ttlSeconds: number): Promise<void> {
    this.store.set(sessionId, {
      data: { ...data },
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async destroy(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
  }

  async close(): Promise<void> {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(id);
    }
  }
}

// ─── Redis Store Stub ─────────────────────────────────────────────────────────

class RedisStore implements SessionStore {
  private client: unknown;

  constructor(connection: unknown) {
    if (!connection) {
      throw new Error(
        "Redis store requires an ioredis client passed as `connection`. " +
        "Install ioredis: npm install ioredis\n" +
        "const Redis = require('ioredis');\n" +
        "const client = new Redis(process.env.REDIS_URL);\n" +
        "new SessionManager({ store: 'redis', connection: client, secret: '...' })"
      );
    }
    this.client = connection;
  }

  private get redis(): Record<string, (...a: unknown[]) => Promise<unknown>> {
    return this.client as Record<string, (...a: unknown[]) => Promise<unknown>>;
  }

  async get(sessionId: string): Promise<Record<string, unknown> | null> {
    const raw = await this.redis["get"](`sess:${sessionId}`) as string | null;
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  async set(sessionId: string, data: Record<string, unknown>, ttlSeconds: number): Promise<void> {
    await this.redis["set"](`sess:${sessionId}`, JSON.stringify(data), "EX", ttlSeconds);
  }

  async destroy(sessionId: string): Promise<void> {
    await this.redis["del"](`sess:${sessionId}`);
  }

  async close(): Promise<void> {
    // Client lifecycle is managed externally
  }
}

// ─── Postgres Store Stub ──────────────────────────────────────────────────────

class PostgresStore implements SessionStore {
  private pool: unknown;

  constructor(connection: unknown) {
    if (!connection) {
      throw new Error(
        "Postgres store requires a pg.Pool passed as `connection`. " +
        "Install pg: npm install pg\n" +
        "const { Pool } = require('pg');\n" +
        "const pool = new Pool({ connectionString: process.env.DATABASE_URL });\n" +
        "Ensure table exists: CREATE TABLE sessions (id TEXT PRIMARY KEY, data JSONB, expires_at TIMESTAMPTZ);"
      );
    }
    this.pool = connection;
  }

  private query(sql: string, params: unknown[]): Promise<{ rows: Record<string, unknown>[] }> {
    const pool = this.pool as { query: (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
    return pool.query(sql, params);
  }

  async get(sessionId: string): Promise<Record<string, unknown> | null> {
    const { rows } = await this.query(
      "SELECT data FROM sessions WHERE id = $1 AND expires_at > NOW()",
      [sessionId]
    );
    return rows[0] ? (rows[0]["data"] as Record<string, unknown>) : null;
  }

  async set(sessionId: string, data: Record<string, unknown>, ttlSeconds: number): Promise<void> {
    await this.query(
      `INSERT INTO sessions (id, data, expires_at) VALUES ($1, $2, NOW() + $3 * INTERVAL '1 second')
       ON CONFLICT (id) DO UPDATE SET data = $2, expires_at = NOW() + $3 * INTERVAL '1 second'`,
      [sessionId, JSON.stringify(data), ttlSeconds]
    );
  }

  async destroy(sessionId: string): Promise<void> {
    await this.query("DELETE FROM sessions WHERE id = $1", [sessionId]);
  }

  async close(): Promise<void> {
    // Pool lifecycle is managed externally
  }
}

// ─── Session Manager ──────────────────────────────────────────────────────────

export class SessionManager {
  private config: Required<SessionManagerConfig>;
  private store: SessionStore;
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: SessionManagerConfig) {
    if (!config.secret) throw new Error("SessionManager: `secret` is required.");
    if (config.secret.length < 16) {
      console.warn("SessionManager: `secret` should be at least 32 characters for security.");
    }

    this.config = {
      store: config.store ?? "memory",
      connection: config.connection ?? null,
      secret: config.secret,
      ttl: config.ttl ?? 86400,
      cookieName: config.cookieName ?? "sid",
      secure: config.secure !== undefined ? config.secure : true,
    };

    switch (this.config.store) {
      case "memory":
        this.store = new MemoryStore(this.config.ttl);
        break;
      case "redis":
        this.store = new RedisStore(this.config.connection);
        break;
      case "postgres":
        this.store = new PostgresStore(this.config.connection);
        break;
      default:
        throw new Error(`Unknown store type: ${this.config.store}`);
    }
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]!.push(listener);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const list = this.listeners[event];
    if (list) {
      this.listeners[event] = list.filter((l) => l !== listener) as Listener<EventMap[K]>[];
    }
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const list = this.listeners[event];
    if (list) list.forEach((l) => l(payload));
  }

  /** Create a new session. Returns the session ID and a Set-Cookie header value. */
  async create(data: Record<string, unknown>): Promise<SessionCookieResult> {
    try {
      const sessionId = crypto.randomBytes(32).toString("hex");
      await this.store.set(sessionId, data, this.config.ttl);

      const signed = this.signSessionId(sessionId);
      const cookie = this.formatCookie(signed);

      this.emit("onCreated", { sessionId });
      return { sessionId, cookie };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "CREATE_ERROR", message });
      throw err;
    }
  }

  /** Retrieve session data by session ID. Returns null if not found or expired. */
  async get(sessionId: string): Promise<Record<string, unknown> | null> {
    try {
      const data = await this.store.get(sessionId);
      if (data === null) {
        this.emit("onExpired", { sessionId });
      }
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "GET_ERROR", message });
      throw err;
    }
  }

  /** Update session data, resetting TTL. */
  async set(sessionId: string, data: Record<string, unknown>): Promise<void> {
    try {
      const existing = await this.store.get(sessionId);
      const merged = existing ? { ...existing, ...data } : { ...data };
      await this.store.set(sessionId, merged, this.config.ttl);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "SET_ERROR", message });
      throw err;
    }
  }

  /** Delete a session. */
  async destroy(sessionId: string): Promise<void> {
    try {
      await this.store.destroy(sessionId);
      this.emit("onDestroyed", { sessionId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "DESTROY_ERROR", message });
      throw err;
    }
  }

  /**
   * Parse a Cookie header and return the verified session ID.
   * Returns null if the cookie is absent or the signature is invalid.
   */
  parseCookie(cookieHeader: string): string | null {
    const pairs = cookieHeader.split(";").map((s) => s.trim());
    for (const pair of pairs) {
      const eqIdx = pair.indexOf("=");
      if (eqIdx === -1) continue;
      const name = pair.slice(0, eqIdx).trim();
      const value = pair.slice(eqIdx + 1).trim();
      if (name === this.config.cookieName) {
        return this.verifySignedSessionId(decodeURIComponent(value));
      }
    }
    return null;
  }

  /** Close underlying store connections and cleanup intervals. */
  async close(): Promise<void> {
    await this.store.close();
  }

  // ─── Private: Cookie Signing ─────────────────────────────────────────────────

  private signSessionId(sessionId: string): string {
    const sig = crypto
      .createHmac("sha256", this.config.secret)
      .update(sessionId)
      .digest("base64url");
    return `${sessionId}.${sig}`;
  }

  private verifySignedSessionId(signed: string): string | null {
    const dotIdx = signed.lastIndexOf(".");
    if (dotIdx === -1) return null;

    const sessionId = signed.slice(0, dotIdx);
    const providedSig = signed.slice(dotIdx + 1);

    const expectedSig = crypto
      .createHmac("sha256", this.config.secret)
      .update(sessionId)
      .digest("base64url");

    const provBuf = Buffer.from(providedSig, "base64url");
    const expBuf = Buffer.from(expectedSig, "base64url");

    if (provBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(provBuf, expBuf)) return null;

    return sessionId;
  }

  private formatCookie(signedId: string): string {
    const parts = [
      `${this.config.cookieName}=${encodeURIComponent(signedId)}`,
      `HttpOnly`,
      `SameSite=Lax`,
      `Path=/`,
      `Max-Age=${this.config.ttl}`,
    ];
    if (this.config.secure) parts.push("Secure");
    return parts.join("; ");
  }
}

export default SessionManager;
