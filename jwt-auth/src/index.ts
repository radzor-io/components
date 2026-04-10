// @radzor/jwt-auth — Create and verify JWT tokens using HMAC-SHA with Node.js crypto

import * as crypto from "crypto";

export interface JwtAuthConfig {
  secret: string;
  algorithm?: "HS256" | "HS384" | "HS512";
  issuer?: string;
  audience?: string;
  expiresIn?: number;
}

export interface TokenPayload {
  [key: string]: unknown;
  sub?: string;
  iss?: string;
  aud?: string;
  exp: number;
  iat: number;
  jti?: string;
}

export type EventMap = {
  onSigned: { sub: string; expiresAt: number };
  onVerified: { sub: string; valid: boolean };
  onExpired: { sub: string; expiredAt: number };
  onError: { code: string; message: string };
};

export type Listener<T> = (event: T) => void;

const ALG_MAP: Record<string, string> = {
  HS256: "sha256",
  HS384: "sha384",
  HS512: "sha512",
};

export class JwtAuth {
  private secret: string;
  private algorithm: "HS256" | "HS384" | "HS512";
  private issuer?: string;
  private audience?: string;
  private defaultExpiresIn: number;
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: JwtAuthConfig) {
    if (!config.secret || config.secret.length < 16) {
      throw new Error("JWT secret must be at least 16 characters. 32+ characters recommended.");
    }

    this.secret = config.secret;
    this.algorithm = config.algorithm ?? "HS256";
    this.issuer = config.issuer;
    this.audience = config.audience;
    this.defaultExpiresIn = config.expiresIn ?? 3600;
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

  /** Sign a new JWT token with the given claims. */
  sign(claims: Record<string, unknown>, expiresIn?: number): string {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + (expiresIn ?? this.defaultExpiresIn);

    const payload: TokenPayload = {
      ...claims,
      iat: now,
      exp,
      jti: crypto.randomUUID(),
    };

    if (this.issuer && !payload.iss) {
      payload.iss = this.issuer;
    }

    if (this.audience && !payload.aud) {
      payload.aud = this.audience;
    }

    const header = { alg: this.algorithm, typ: "JWT" };
    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    const signature = this.computeSignature(`${encodedHeader}.${encodedPayload}`);

    const token = `${encodedHeader}.${encodedPayload}.${signature}`;
    const sub = String(payload.sub ?? "");

    this.emit("onSigned", { sub, expiresAt: exp });

    return token;
  }

  /** Verify a JWT token's signature and expiration. Throws on invalid or expired tokens. */
  verify(token: string): TokenPayload {
    const parts = token.split(".");
    if (parts.length !== 3) {
      const err = { code: "MALFORMED_TOKEN", message: "Token must have 3 parts separated by dots." };
      this.emit("onError", err);
      throw new Error(err.message);
    }

    const [encodedHeader, encodedPayload, providedSignature] = parts;

    // Verify header
    let header: { alg: string; typ: string };
    try {
      header = JSON.parse(this.base64UrlDecode(encodedHeader));
    } catch {
      const err = { code: "INVALID_HEADER", message: "Failed to parse JWT header." };
      this.emit("onError", err);
      throw new Error(err.message);
    }

    if (header.alg !== this.algorithm) {
      const err = {
        code: "ALGORITHM_MISMATCH",
        message: `Expected algorithm ${this.algorithm}, got ${header.alg}.`,
      };
      this.emit("onError", err);
      throw new Error(err.message);
    }

    // Verify signature (timing-safe)
    const expectedSignature = this.computeSignature(`${encodedHeader}.${encodedPayload}`);
    const sigBuf = Buffer.from(providedSignature);
    const expectedBuf = Buffer.from(expectedSignature);

    let signatureValid = false;
    if (sigBuf.length === expectedBuf.length) {
      signatureValid = crypto.timingSafeEqual(sigBuf, expectedBuf);
    }

    if (!signatureValid) {
      const err = { code: "INVALID_SIGNATURE", message: "JWT signature verification failed." };
      this.emit("onError", err);
      throw new Error(err.message);
    }

    // Decode payload
    let payload: TokenPayload;
    try {
      payload = JSON.parse(this.base64UrlDecode(encodedPayload));
    } catch {
      const err = { code: "INVALID_PAYLOAD", message: "Failed to parse JWT payload." };
      this.emit("onError", err);
      throw new Error(err.message);
    }

    const sub = String(payload.sub ?? "");

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      this.emit("onExpired", { sub, expiredAt: payload.exp });
      throw new Error(`Token expired at ${new Date(payload.exp * 1000).toISOString()}`);
    }

    // Check issuer
    if (this.issuer && payload.iss !== this.issuer) {
      const err = { code: "INVALID_ISSUER", message: `Expected issuer "${this.issuer}", got "${payload.iss}".` };
      this.emit("onError", err);
      throw new Error(err.message);
    }

    // Check audience
    if (this.audience && payload.aud !== this.audience) {
      const err = {
        code: "INVALID_AUDIENCE",
        message: `Expected audience "${this.audience}", got "${payload.aud}".`,
      };
      this.emit("onError", err);
      throw new Error(err.message);
    }

    this.emit("onVerified", { sub, valid: true });

    return payload;
  }

  /** Decode a JWT token without verifying the signature. */
  decode(token: string): TokenPayload {
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new Error("Token must have 3 parts separated by dots.");
    }

    try {
      return JSON.parse(this.base64UrlDecode(parts[1]));
    } catch {
      throw new Error("Failed to parse JWT payload.");
    }
  }

  /** Verify an existing token and issue a new one with refreshed expiration. */
  refresh(token: string, expiresIn?: number): string {
    const payload = this.verify(token);

    // Remove time-related claims (they will be regenerated)
    const { iat: _iat, exp: _exp, jti: _jti, ...claims } = payload;

    return this.sign(claims, expiresIn);
  }

  private computeSignature(input: string): string {
    const hashAlg = ALG_MAP[this.algorithm];
    const hmac = crypto.createHmac(hashAlg, this.secret);
    hmac.update(input);
    return this.base64UrlEncodeBuffer(hmac.digest());
  }

  private base64UrlEncode(str: string): string {
    return Buffer.from(str, "utf-8")
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  }

  private base64UrlEncodeBuffer(buf: Buffer): string {
    return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  }

  private base64UrlDecode(str: string): string {
    // Restore standard base64
    let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    // Add padding
    const padding = 4 - (base64.length % 4);
    if (padding !== 4) {
      base64 += "=".repeat(padding);
    }
    return Buffer.from(base64, "base64").toString("utf-8");
  }
}

export default JwtAuth;
