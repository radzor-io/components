// @radzor/encryption — AES-256-GCM encryption, decryption, key generation, and hashing

import * as crypto from "crypto";

export interface EncryptionConfig {
  key?: string;
  encoding?: "hex" | "base64";
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  tag: string;
  encoding: string;
}

export type EventMap = {
  onEncrypted: { bytesEncrypted: number };
  onDecrypted: { bytesDecrypted: number };
  onError: { operation: string; message: string };
};

export type Listener<T> = (event: T) => void;

const AES_KEY_BYTES = 32; // 256 bits
const IV_BYTES = 12; // 96 bits for GCM
const TAG_BYTES = 16; // 128-bit auth tag

export class Encryption {
  private key: Buffer | null;
  private encoding: BufferEncoding;
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: EncryptionConfig = {}) {
    this.encoding = config.encoding ?? "hex";

    if (config.key) {
      this.key = this.parseKey(config.key);
    } else {
      this.key = null;
    }
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

  /** Encrypt data using AES-256-GCM with a random IV. */
  encrypt(plaintext: string | Buffer, aad?: string): EncryptedPayload {
    const key = this.requireKey();

    try {
      const iv = crypto.randomBytes(IV_BYTES);
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

      if (aad) {
        cipher.setAAD(Buffer.from(aad, "utf-8"));
      }

      const input = typeof plaintext === "string" ? Buffer.from(plaintext, "utf-8") : plaintext;
      const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
      const tag = cipher.getAuthTag();

      this.emit("onEncrypted", { bytesEncrypted: input.length });

      return {
        ciphertext: encrypted.toString(this.encoding),
        iv: iv.toString("hex"),
        tag: tag.toString("hex"),
        encoding: this.encoding,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { operation: "encrypt", message });
      throw err;
    }
  }

  /** Decrypt an AES-256-GCM encrypted payload. */
  decrypt(payload: EncryptedPayload, aad?: string): string {
    const key = this.requireKey();

    try {
      const iv = Buffer.from(payload.iv, "hex");
      const tag = Buffer.from(payload.tag, "hex");
      const enc = (payload.encoding || this.encoding) as BufferEncoding;
      const ciphertext = Buffer.from(payload.ciphertext, enc);

      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);

      if (aad) {
        decipher.setAAD(Buffer.from(aad, "utf-8"));
      }

      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

      this.emit("onDecrypted", { bytesDecrypted: decrypted.length });

      return decrypted.toString("utf-8");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { operation: "decrypt", message });

      // Re-throw with a clearer message for auth failures
      if (message.includes("Unsupported state") || message.includes("unable to authenticate")) {
        throw new Error("Decryption failed: authentication tag mismatch. Data may have been tampered with.");
      }
      throw err;
    }
  }

  /** Generate a cryptographically secure random 256-bit key as a hex string. */
  generateKey(): string {
    return crypto.randomBytes(AES_KEY_BYTES).toString("hex");
  }

  /** Compute a cryptographic hash of the input data. */
  hash(data: string | Buffer, algorithm: "sha256" | "sha384" | "sha512" = "sha256"): string {
    const input = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
    return crypto.createHash(algorithm).update(input).digest(this.encoding);
  }

  /** Derive a key from a password using PBKDF2. */
  async deriveKey(
    password: string,
    salt?: string,
    iterations: number = 100000
  ): Promise<{ key: string; salt: string }> {
    const saltBuffer = salt ? Buffer.from(salt, "hex") : crypto.randomBytes(16);

    return new Promise((resolve, reject) => {
      crypto.pbkdf2(
        password,
        saltBuffer,
        iterations,
        AES_KEY_BYTES,
        "sha512",
        (err, derivedKey) => {
          if (err) {
            this.emit("onError", { operation: "deriveKey", message: err.message });
            reject(err);
          } else {
            const keyHex = derivedKey.toString("hex");
            resolve({ key: keyHex, salt: saltBuffer.toString("hex") });
          }
        }
      );
    });
  }

  /** Set or replace the encryption key. */
  setKey(key: string): void {
    this.key = this.parseKey(key);
  }

  /** Compute an HMAC for data integrity verification. */
  hmac(data: string | Buffer, algorithm: "sha256" | "sha384" | "sha512" = "sha256"): string {
    const key = this.requireKey();
    const input = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
    return crypto.createHmac(algorithm, key).update(input).digest(this.encoding);
  }

  /** Timing-safe comparison of two strings (e.g. for HMAC verification). */
  timingSafeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  private requireKey(): Buffer {
    if (!this.key) {
      throw new Error("Encryption key not set. Pass it in the constructor or call setKey().");
    }
    return this.key;
  }

  private parseKey(key: string): Buffer {
    // Accept hex or base64 encoded keys
    let keyBuffer: Buffer;

    if (/^[0-9a-fA-F]+$/.test(key) && key.length === AES_KEY_BYTES * 2) {
      keyBuffer = Buffer.from(key, "hex");
    } else if (key.length === 44 && key.endsWith("=")) {
      keyBuffer = Buffer.from(key, "base64");
    } else if (key.length >= AES_KEY_BYTES) {
      // Use raw bytes (truncated/padded to 32 bytes)
      keyBuffer = Buffer.alloc(AES_KEY_BYTES);
      Buffer.from(key, "utf-8").copy(keyBuffer, 0, 0, AES_KEY_BYTES);
    } else {
      throw new Error(
        `Invalid key: expected ${AES_KEY_BYTES * 2} hex characters (${AES_KEY_BYTES} bytes). ` +
        `Got ${key.length} characters. Use generateKey() to create a valid key.`
      );
    }

    if (keyBuffer.length !== AES_KEY_BYTES) {
      throw new Error(`Key must be exactly ${AES_KEY_BYTES} bytes (${AES_KEY_BYTES * 2} hex chars).`);
    }

    return keyBuffer;
  }
}

export default Encryption;
