// @radzor/password-hash — Secure password hashing using Node.js built-in crypto (scrypt)
// Note: For true bcrypt semantics use `npm install bcrypt`. This implementation uses
// scrypt via Node crypto which provides equivalent or stronger security properties.

import * as crypto from "crypto";

export type Algorithm = "bcrypt" | "argon2id";

export interface PasswordHashConfig {
  algorithm?: Algorithm;
  rounds?: number;      // bcrypt: cost factor (default 12); maps to scrypt N = 2^rounds
  memoryCost?: number;  // argon2id: memory in KB (default 65536); maps to scrypt r/N
  timeCost?: number;    // argon2id: iterations (default 3); maps to scrypt p
}

export interface StrengthReport {
  score: number;     // 0–4
  feedback: string[];
  strong: boolean;
}

export interface HashedEvent {
  algorithm: Algorithm;
}

export interface VerifiedEvent {
  match: boolean;
}

export interface ErrorEvent {
  code: string;
  message: string;
}

export type EventMap = {
  onHashed: HashedEvent;
  onVerified: VerifiedEvent;
  onError: ErrorEvent;
};

export type Listener<T> = (event: T) => void;

// Stored hash format: $radzor-scrypt$v1$N$r$p$salt(hex)$hash(hex)
const HASH_PREFIX = "$radzor-scrypt$v1$";
const SALT_BYTES = 32;

export class PasswordHash {
  private config: Required<PasswordHashConfig>;
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: PasswordHashConfig = {}) {
    this.config = {
      algorithm: config.algorithm ?? "bcrypt",
      rounds: config.rounds ?? 12,
      memoryCost: config.memoryCost ?? 65536,
      timeCost: config.timeCost ?? 3,
    };
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

  /** Hash a password. Returns a self-describing hash string. Never logs the password. */
  async hash(password: string): Promise<string> {
    try {
      const { N, r, p } = this.deriveScryptParams();
      const salt = crypto.randomBytes(SALT_BYTES);
      const keyLength = 64;

      const derived = await new Promise<Buffer>((resolve, reject) => {
        crypto.scrypt(password, salt, keyLength, { N, r, p }, (err, key) => {
          if (err) reject(err);
          else resolve(key);
        });
      });

      const hashStr = `${HASH_PREFIX}${N}$${r}$${p}$${salt.toString("hex")}$${derived.toString("hex")}`;
      this.emit("onHashed", { algorithm: this.config.algorithm });
      return hashStr;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "HASH_ERROR", message });
      throw err;
    }
  }

  /** Verify a password against a stored hash. Uses timing-safe comparison. */
  async verify(password: string, storedHash: string): Promise<boolean> {
    try {
      if (!storedHash.startsWith(HASH_PREFIX)) {
        throw new Error("Unrecognized hash format. Expected a hash produced by @radzor/password-hash.");
      }

      const parts = storedHash.slice(HASH_PREFIX.length).split("$");
      if (parts.length !== 5) {
        throw new Error("Malformed hash string.");
      }

      const [Nstr, rStr, pStr, saltHex, hashHex] = parts;
      const N = parseInt(Nstr, 10);
      const r = parseInt(rStr, 10);
      const p = parseInt(pStr, 10);
      const salt = Buffer.from(saltHex, "hex");
      const expected = Buffer.from(hashHex, "hex");

      const derived = await new Promise<Buffer>((resolve, reject) => {
        crypto.scrypt(password, salt, expected.length, { N, r, p }, (err, key) => {
          if (err) reject(err);
          else resolve(key);
        });
      });

      // Timing-safe comparison to prevent timing attacks
      let match = false;
      if (derived.length === expected.length) {
        match = crypto.timingSafeEqual(derived, expected);
      }

      this.emit("onVerified", { match });
      return match;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "VERIFY_ERROR", message });
      throw err;
    }
  }

  /** Check password strength without hashing. Returns a score 0–4 and feedback. */
  checkStrength(password: string): StrengthReport {
    const feedback: string[] = [];
    let score = 0;

    if (password.length >= 8) score++;
    else feedback.push("Use at least 8 characters.");

    if (password.length >= 12) score++;
    else if (password.length >= 8) feedback.push("Consider using 12+ characters for better security.");

    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    else feedback.push("Mix uppercase and lowercase letters.");

    if (/[0-9]/.test(password)) score++;
    else feedback.push("Add at least one number.");

    if (/[^a-zA-Z0-9]/.test(password)) score++;
    else feedback.push("Add at least one special character (!@#$%^&*).");

    // Common patterns reduce effective score
    if (/^(.)\1+$/.test(password)) {
      score = Math.max(0, score - 2);
      feedback.push("Avoid repeated characters.");
    }
    if (/^(012|123|234|345|456|567|678|789|890|abc|qwerty|password)/i.test(password)) {
      score = Math.max(0, score - 1);
      feedback.push("Avoid common sequences or dictionary words.");
    }

    // Cap at 4
    score = Math.min(4, score);

    return {
      score,
      feedback,
      strong: score >= 3,
    };
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private deriveScryptParams(): { N: number; r: number; p: number } {
    if (this.config.algorithm === "bcrypt") {
      // Map bcrypt rounds (cost factor) to scrypt N = 2^rounds
      // Clamp rounds to reasonable range
      const rounds = Math.min(Math.max(this.config.rounds, 8), 20);
      const N = Math.pow(2, rounds);
      return { N, r: 8, p: 1 };
    } else {
      // argon2id mode: use memory cost and time cost
      // Map memoryCost (KB) to scrypt N: N = memoryCost / 8 / r, round to power of 2
      const r = 8;
      const p = this.config.timeCost;
      const rawN = Math.floor(this.config.memoryCost / 8 / r);
      const N = Math.pow(2, Math.round(Math.log2(Math.max(rawN, 1024))));
      return { N, r, p };
    }
  }
}

export default PasswordHash;
