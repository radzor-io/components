// @radzor/magic-link-auth — HMAC-signed magic link authentication

import { createHmac, randomBytes } from "crypto";

export interface MagicLinkAuthConfig {
  secret: string;
  tokenTtl?: number;
  baseUrl: string;
  singleUse?: boolean;
}

export interface GenerateLinkResult {
  url: string;
  token: string;
  expiresAt: Date;
}

export interface VerifyTokenResult {
  email: string;
  valid: boolean;
}

export interface TokenMeta {
  email: string;
  expiresAt: Date;
  used: boolean;
}

type EventMap = {
  onLinkSent: { email: string; url: string; expiresAt: Date };
  onVerified: { email: string };
  onExpired: { email: string; token: string };
  onError: { code: string; message: string };
};

interface TokenPayload {
  email: string;
  expiresAt: number;
  id: string;
}

export class MagicLinkAuth {
  private config: Required<MagicLinkAuthConfig>;
  private store: Map<string, TokenMeta> = new Map();
  private listeners: Map<string, Function[]> = new Map();

  constructor(config: MagicLinkAuthConfig) {
    this.config = {
      tokenTtl: 900,
      singleUse: true,
      ...config,
    };
  }

  on<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void): void {
    const handlers = this.listeners.get(event) ?? [];
    handlers.push(handler as Function);
    this.listeners.set(event, handlers);
  }

  off<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void): void {
    const handlers = this.listeners.get(event) ?? [];
    this.listeners.set(event, handlers.filter((h) => h !== handler));
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    for (const handler of this.listeners.get(event) ?? []) handler(payload);
  }

  async generateLink(email: string): Promise<GenerateLinkResult> {
    try {
      const id = randomBytes(16).toString("hex");
      const expiresAt = new Date(Date.now() + this.config.tokenTtl * 1000);
      const payload: TokenPayload = { email, expiresAt: expiresAt.getTime(), id };

      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const sig = this._sign(payloadB64);
      const token = `${payloadB64}.${sig}`;

      this.store.set(id, { email, expiresAt, used: false });

      const separator = this.config.baseUrl.includes("?") ? "&" : "?";
      const url = `${this.config.baseUrl}${separator}token=${encodeURIComponent(token)}`;

      this.emit("onLinkSent", { email, url, expiresAt });
      return { url, token, expiresAt };
    } catch (err: any) {
      this.emit("onError", { code: "GENERATE_ERROR", message: err.message });
      throw err;
    }
  }

  async verifyToken(token: string): Promise<VerifyTokenResult> {
    try {
      const [payloadB64, sig] = token.split(".");
      if (!payloadB64 || !sig) {
        return { email: "", valid: false };
      }

      const expectedSig = this._sign(payloadB64);
      if (!this._timingSafeEqual(sig, expectedSig)) {
        return { email: "", valid: false };
      }

      let payload: TokenPayload;
      try {
        payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
      } catch {
        return { email: "", valid: false };
      }

      const meta = this.store.get(payload.id);
      if (!meta) {
        return { email: payload.email, valid: false };
      }

      if (Date.now() > payload.expiresAt) {
        this.emit("onExpired", { email: payload.email, token });
        return { email: payload.email, valid: false };
      }

      if (this.config.singleUse && meta.used) {
        return { email: payload.email, valid: false };
      }

      if (this.config.singleUse) {
        this.store.set(payload.id, { ...meta, used: true });
      }

      this.emit("onVerified", { email: payload.email });
      return { email: payload.email, valid: true };
    } catch (err: any) {
      this.emit("onError", { code: "VERIFY_ERROR", message: err.message });
      throw err;
    }
  }

  async revokeToken(token: string): Promise<void> {
    try {
      const [payloadB64] = token.split(".");
      if (!payloadB64) return;

      let payload: TokenPayload;
      try {
        payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
      } catch {
        return;
      }

      const meta = this.store.get(payload.id);
      if (meta) {
        this.store.set(payload.id, { ...meta, used: true });
      }
    } catch (err: any) {
      this.emit("onError", { code: "REVOKE_ERROR", message: err.message });
      throw err;
    }
  }

  getTokenMeta(token: string): TokenMeta | undefined {
    const [payloadB64] = token.split(".");
    if (!payloadB64) return undefined;
    try {
      const payload: TokenPayload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
      return this.store.get(payload.id);
    } catch {
      return undefined;
    }
  }

  private _sign(data: string): string {
    return createHmac("sha256", this.config.secret).update(data).digest("base64url");
  }

  private _timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    let diff = 0;
    for (let i = 0; i < bufA.length; i++) {
      diff |= bufA[i] ^ bufB[i];
    }
    return diff === 0;
  }
}
