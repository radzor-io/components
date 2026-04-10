// @radzor/payment-refund — Process full and partial refunds via Stripe

import { createHmac, timingSafeEqual } from "crypto";

const STRIPE_API = "https://api.stripe.com/v1";

export interface PaymentRefundConfig {
  secretKey: string;
  webhookSecret: string;
}

export interface RefundResult {
  id: string;
  amount: number;
  currency: string;
  status: string;
  paymentIntentId: string;
  reason?: string;
}

export type RefundReason = "duplicate" | "fraudulent" | "requested_by_customer";

export type EventMap = {
  onRefundCompleted: {
    refundId: string;
    paymentIntentId: string;
    amount: number;
    currency: string;
  };
  onRefundFailed: {
    refundId: string;
    paymentIntentId: string;
    reason: string;
  };
};

export type Listener<T> = (event: T) => void;

export class PaymentRefund {
  private secretKey: string;
  private webhookSecret: string;
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: PaymentRefundConfig) {
    this.secretKey = config.secretKey;
    this.webhookSecret = config.webhookSecret;
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

  /** Create a full or partial refund for a payment. */
  async createRefund(
    paymentIntentId: string,
    amount?: number,
    reason?: RefundReason
  ): Promise<RefundResult> {
    const params = new URLSearchParams();
    params.set("payment_intent", paymentIntentId);

    if (amount !== undefined) {
      params.set("amount", String(amount));
    }

    if (reason) {
      params.set("reason", reason);
    }

    const data = await this.apiCall("POST", "/refunds", params);
    const result = this.mapRefund(data);

    if (result.status === "succeeded") {
      this.emit("onRefundCompleted", {
        refundId: result.id,
        paymentIntentId: result.paymentIntentId,
        amount: result.amount,
        currency: result.currency,
      });
    } else if (result.status === "failed") {
      this.emit("onRefundFailed", {
        refundId: result.id,
        paymentIntentId: result.paymentIntentId,
        reason: result.reason ?? "unknown",
      });
    }

    return result;
  }

  /** Get the current status of a refund. */
  async getRefundStatus(refundId: string): Promise<RefundResult> {
    const data = await this.apiCall("GET", `/refunds/${refundId}`);
    return this.mapRefund(data);
  }

  /** List all refunds for a payment intent. */
  async listRefunds(paymentIntentId: string): Promise<RefundResult[]> {
    const params = new URLSearchParams();
    params.set("payment_intent", paymentIntentId);
    params.set("limit", "100");

    const data = await this.apiCall("GET", "/refunds", params);
    const items: any[] = data.data ?? [];
    return items.map((item) => this.mapRefund(item));
  }

  /** Verify and process a Stripe webhook event for refund lifecycle. */
  handleWebhook(payload: string, signature: string): { type: string; data: any } {
    const parts = signature.split(",").reduce(
      (acc, part) => {
        const [key, val] = part.split("=");
        if (key === "t") acc.timestamp = val;
        if (key === "v1") acc.signatures.push(val);
        return acc;
      },
      { timestamp: "", signatures: [] as string[] }
    );

    if (!parts.timestamp || parts.signatures.length === 0) {
      throw new Error("Invalid Stripe signature header");
    }

    const signedPayload = `${parts.timestamp}.${payload}`;
    const expected = createHmac("sha256", this.webhookSecret)
      .update(signedPayload)
      .digest("hex");

    const match = parts.signatures.some((sig) => {
      try {
        return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
      } catch {
        return false;
      }
    });

    if (!match) {
      throw new Error("Webhook signature verification failed");
    }

    const tolerance = 300;
    const ts = parseInt(parts.timestamp, 10);
    if (Math.abs(Math.floor(Date.now() / 1000) - ts) > tolerance) {
      throw new Error("Webhook timestamp too old");
    }

    const event = JSON.parse(payload);
    const obj = event.data?.object ?? {};

    switch (event.type) {
      case "charge.refunded":
      case "charge.refund.updated": {
        const refunds = obj.refunds?.data ?? [];
        for (const refund of refunds) {
          if (refund.status === "succeeded") {
            this.emit("onRefundCompleted", {
              refundId: refund.id,
              paymentIntentId: obj.payment_intent ?? "",
              amount: refund.amount,
              currency: refund.currency,
            });
          } else if (refund.status === "failed") {
            this.emit("onRefundFailed", {
              refundId: refund.id,
              paymentIntentId: obj.payment_intent ?? "",
              reason: refund.failure_reason ?? "unknown",
            });
          }
        }
        break;
      }

      case "refund.updated": {
        if (obj.status === "succeeded") {
          this.emit("onRefundCompleted", {
            refundId: obj.id,
            paymentIntentId: obj.payment_intent ?? "",
            amount: obj.amount,
            currency: obj.currency,
          });
        } else if (obj.status === "failed") {
          this.emit("onRefundFailed", {
            refundId: obj.id,
            paymentIntentId: obj.payment_intent ?? "",
            reason: obj.failure_reason ?? "unknown",
          });
        }
        break;
      }
    }

    return { type: event.type, data: obj };
  }

  private mapRefund(data: any): RefundResult {
    return {
      id: data.id,
      amount: data.amount ?? 0,
      currency: data.currency ?? "",
      status: data.status ?? "pending",
      paymentIntentId: data.payment_intent ?? "",
      reason: data.reason,
    };
  }

  private async apiCall(
    method: string,
    path: string,
    params?: URLSearchParams
  ): Promise<any> {
    const url =
      method === "GET" && params
        ? `${STRIPE_API}${path}?${params.toString()}`
        : `${STRIPE_API}${path}`;

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      ...(method !== "GET" && params ? { body: params.toString() } : {}),
    });

    const json = await res.json();
    if (json.error) {
      throw new Error(`Stripe API error: ${json.error.message}`);
    }
    return json;
  }
}

export default PaymentRefund;
