// @radzor/two-factor-auth — TOTP 2FA (RFC 6238)

import { createHmac, randomBytes } from "crypto";

// ---- types ----

export interface TwoFactorConfig {
  issuer: string;
  digits?: number;
  period?: number;
}

export interface TotpSecret {
  base32: string;
  hex: string;
  otpauthUri: string;
}

export type EventMap = {
  onVerified: { valid: boolean; token: string };
  onError: { code: string; message: string };
};

// ---- base32 encode/decode ----

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer): string {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let result = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.substring(i, i + 5).padEnd(5, "0");
    result += BASE32_CHARS[parseInt(chunk, 2)];
  }
  return result;
}

function base32Decode(encoded: string): Buffer {
  let bits = "";
  for (const char of encoded.toUpperCase()) {
    const idx = BASE32_CHARS.indexOf(char);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

// ---- implementation ----

export class TwoFactorAuth {
  private issuer: string;
  private digits: number;
  private period: number;
  private listeners: { [K in keyof EventMap]?: Array<(payload: EventMap[K]) => void> } = {};

  constructor(config: TwoFactorConfig) {
    this.issuer = config.issuer;
    this.digits = config.digits ?? 6;
    this.period = config.period ?? 30;
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

  generateSecret(accountName: string): TotpSecret {
    const buffer = randomBytes(20);
    const base32Secret = base32Encode(buffer);
    const hexSecret = buffer.toString("hex");

    const uri = `otpauth://totp/${encodeURIComponent(this.issuer)}:${encodeURIComponent(accountName)}?secret=${base32Secret}&issuer=${encodeURIComponent(this.issuer)}&algorithm=SHA1&digits=${this.digits}&period=${this.period}`;

    return { base32: base32Secret, hex: hexSecret, otpauthUri: uri };
  }

  generateQrUri(accountName: string, secret: string): string {
    return `otpauth://totp/${encodeURIComponent(this.issuer)}:${encodeURIComponent(accountName)}?secret=${secret}&issuer=${encodeURIComponent(this.issuer)}&algorithm=SHA1&digits=${this.digits}&period=${this.period}`;
  }

  verifyToken(token: string, secret: string, window: number = 1): boolean {
    try {
      const secretBuffer = base32Decode(secret);
      const now = Math.floor(Date.now() / 1000);

      for (let i = -window; i <= window; i++) {
        const timeStep = Math.floor(now / this.period) + i;
        const generated = this.generateTotp(secretBuffer, timeStep);
        if (generated === token) {
          this.emit("onVerified", { valid: true, token });
          return true;
        }
      }

      this.emit("onVerified", { valid: false, token });
      return false;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "VERIFY_ERROR", message });
      throw err;
    }
  }

  private generateTotp(secret: Buffer, timeStep: number): string {
    const timeBuffer = Buffer.alloc(8);
    let t = timeStep;
    for (let i = 7; i >= 0; i--) {
      timeBuffer[i] = t & 0xff;
      t = Math.floor(t / 256);
    }

    const hmac = createHmac("sha1", secret).update(timeBuffer).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    return (code % Math.pow(10, this.digits)).toString().padStart(this.digits, "0");
  }
}
