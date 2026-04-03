// @radzor/api-key-auth — API key authentication

import { createHash, randomBytes, timingSafeEqual } from "crypto";

// ---- types ----

export interface ApiKeyAuthConfig {
  headerName?: string;
  prefix?: string;
}

export interface ApiKey {
  key: string;
  hash: string;
  prefix: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  keyHash?: string;
  metadata?: Record<string, unknown>;
}

type EventMap = {
  onValidated: ValidationResult;
  onRevoked: { keyHash: string };
  onError: { code: string; message: string };
};

// ---- implementation ----

export class ApiKeyAuth {
  private headerName: string;
  private prefix: string;
  private keys: Map<string, ApiKey> = new Map(); // hash -> ApiKey
  private revokedHashes: Set<string> = new Set();
  private listeners: { [K in keyof EventMap]?: Array<(payload: EventMap[K]) => void> } = {};

  constructor(config: ApiKeyAuthConfig = {}) {
    this.headerName = config.headerName ?? "x-api-key";
    this.prefix = config.prefix ?? "rz_";
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

  generateKey(metadata?: Record<string, unknown>): ApiKey {
    const rawKey = randomBytes(32).toString("hex");
    const key = `${this.prefix}${rawKey}`;
    const hash = this.hashKey(key);

    const apiKey: ApiKey = {
      key,
      hash,
      prefix: this.prefix,
      createdAt: Date.now(),
      metadata,
    };

    this.keys.set(hash, apiKey);
    return apiKey;
  }

  hashKey(key: string): string {
    return createHash("sha256").update(key).digest("hex");
  }

  validateKey(key: string): ValidationResult {
    try {
      if (!key.startsWith(this.prefix)) {
        const result: ValidationResult = { valid: false };
        this.emit("onValidated", result);
        return result;
      }

      const hash = this.hashKey(key);

      if (this.revokedHashes.has(hash)) {
        const result: ValidationResult = { valid: false };
        this.emit("onValidated", result);
        return result;
      }

      const stored = this.keys.get(hash);
      if (!stored) {
        const result: ValidationResult = { valid: false };
        this.emit("onValidated", result);
        return result;
      }

      // Timing-safe comparison
      const a = Buffer.from(hash);
      const b = Buffer.from(stored.hash);
      const valid = a.length === b.length && timingSafeEqual(a, b);

      const result: ValidationResult = {
        valid,
        keyHash: hash,
        metadata: stored.metadata,
      };
      this.emit("onValidated", result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "VALIDATE_ERROR", message });
      throw err;
    }
  }

  validateRequest(headers: Record<string, string | undefined>): ValidationResult {
    const key = headers[this.headerName] || headers[this.headerName.toLowerCase()];
    if (!key) {
      return { valid: false };
    }
    return this.validateKey(key);
  }

  revokeKey(keyOrHash: string): void {
    const hash = keyOrHash.startsWith(this.prefix) ? this.hashKey(keyOrHash) : keyOrHash;
    this.revokedHashes.add(hash);
    this.keys.delete(hash);
    this.emit("onRevoked", { keyHash: hash });
  }

  getHeaderName(): string {
    return this.headerName;
  }
}
