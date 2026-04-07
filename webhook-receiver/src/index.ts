// @radzor/webhook-receiver — Secure webhook verification

import { createHmac, timingSafeEqual } from "crypto";

export type Algorithm = "sha256" | "sha1" | "sha512";

export interface WebhookReceiverConfig {
  secret: string;
  algorithm?: Algorithm;
  signatureHeader?: string;
  tolerance?: number;
  timestampHeader?: string;
}

export interface WebhookPayload {
  eventType: string;
  data: any;
  timestamp: number;
  raw: string;
}

export type EventMap = {
  onVerified: { eventType: string; timestamp: number };
  onRejected: { reason: string; code: string };
  onError: { code: string; message: string };
};

export class WebhookReceiver {
  private config: Required<WebhookReceiverConfig>;
  private listeners: Map<string, Function[]> = new Map();

  constructor(config: WebhookReceiverConfig) {
    this.config = {
      secret: config.secret,
      algorithm: config.algorithm ?? "sha256",
      signatureHeader: config.signatureHeader ?? "x-signature-256",
      tolerance: config.tolerance ?? 300,
      timestampHeader: config.timestampHeader ?? "",
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

  verify(payload: string | Buffer, signature: string, timestamp?: string): WebhookPayload {
    const body = typeof payload === "string" ? payload : payload.toString("utf-8");

    // Replay protection
    if (timestamp && this.config.tolerance > 0) {
      const ts = parseInt(timestamp, 10);
      const age = Math.abs(Math.floor(Date.now() / 1000) - ts);
      if (age > this.config.tolerance) {
        this.emit("onRejected", { reason: "Timestamp too old", code: "REPLAY_DETECTED" });
        throw new Error("Webhook timestamp outside tolerance window");
      }
    }

    // Compute expected signature
    const signBody = timestamp ? `${timestamp}.${body}` : body;
    const expected = createHmac(this.config.algorithm, this.config.secret)
      .update(signBody)
      .digest("hex");

    // Strip prefix (e.g., "sha256=")
    const sig = signature.replace(/^(sha256=|sha1=|sha512=)/, "");

    // Timing-safe comparison
    const expectedBuf = Buffer.from(expected, "hex");
    const sigBuf = Buffer.from(sig, "hex");

    if (expectedBuf.length !== sigBuf.length || !timingSafeEqual(expectedBuf, sigBuf)) {
      this.emit("onRejected", { reason: "Invalid signature", code: "INVALID_SIGNATURE" });
      throw new Error("Webhook signature verification failed");
    }

    const parsed = JSON.parse(body);
    const result: WebhookPayload = {
      eventType: parsed.type ?? parsed.event ?? parsed.event_type ?? "unknown",
      data: parsed.data ?? parsed,
      timestamp: timestamp ? parseInt(timestamp, 10) : Math.floor(Date.now() / 1000),
      raw: body,
    };

    this.emit("onVerified", { eventType: result.eventType, timestamp: result.timestamp });
    return result;
  }

  verifyStripe(payload: string, signatureHeader: string): WebhookPayload {
    const parts = Object.fromEntries(
      signatureHeader.split(",").map((p) => {
        const [k, v] = p.split("=");
        return [k, v];
      })
    );

    const timestamp = parts.t;
    const sig = parts.v1;

    if (!timestamp || !sig) {
      this.emit("onRejected", { reason: "Missing Stripe signature parts", code: "INVALID_FORMAT" });
      throw new Error("Invalid Stripe-Signature header format");
    }

    // Replay protection
    if (this.config.tolerance > 0) {
      const age = Math.abs(Math.floor(Date.now() / 1000) - parseInt(timestamp, 10));
      if (age > this.config.tolerance) {
        this.emit("onRejected", { reason: "Timestamp too old", code: "REPLAY_DETECTED" });
        throw new Error("Stripe webhook timestamp outside tolerance");
      }
    }

    const expected = createHmac("sha256", this.config.secret)
      .update(`${timestamp}.${payload}`)
      .digest("hex");

    const expectedBuf = Buffer.from(expected, "hex");
    const sigBuf = Buffer.from(sig, "hex");

    if (expectedBuf.length !== sigBuf.length || !timingSafeEqual(expectedBuf, sigBuf)) {
      this.emit("onRejected", { reason: "Invalid Stripe signature", code: "INVALID_SIGNATURE" });
      throw new Error("Stripe webhook signature verification failed");
    }

    const parsed = JSON.parse(payload);
    const result: WebhookPayload = {
      eventType: parsed.type,
      data: parsed.data?.object ?? parsed.data,
      timestamp: parseInt(timestamp, 10),
      raw: payload,
    };

    this.emit("onVerified", { eventType: result.eventType, timestamp: result.timestamp });
    return result;
  }
}
