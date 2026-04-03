// @radzor/stripe-checkout — Stripe payment integration (stdlib only, raw HTTP)

import { createHmac, timingSafeEqual } from "crypto";

const STRIPE_API = "https://api.stripe.com/v1";

export interface StripeCheckoutConfig {
  priceId: string;
  quantity?: number;
  successUrl: string;
  cancelUrl: string;
  mode?: "payment" | "subscription";
}

export interface StripeCheckoutSession {
  id: string;
  url: string;
  status: string;
}

export interface WebhookEvent {
  type: string;
  data: Record<string, unknown>;
}

type EventMap = {
  onPaymentSuccess: { sessionId: string; customerId: string; amount: number };
  onPaymentFailed: { sessionId: string; error: string };
  onSubscriptionCreated: { subscriptionId: string; customerId: string; priceId: string };
  onSubscriptionCanceled: { subscriptionId: string };
};

type Listener<T> = (event: T) => void;

export class StripeCheckout {
  private secretKey: string;
  private webhookSecret: string;
  private config: StripeCheckoutConfig;
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: StripeCheckoutConfig & { secretKey: string; webhookSecret: string }) {
    this.secretKey = config.secretKey;
    this.webhookSecret = config.webhookSecret;
    this.config = {
      priceId: config.priceId,
      quantity: config.quantity ?? 1,
      successUrl: config.successUrl,
      cancelUrl: config.cancelUrl,
      mode: config.mode ?? "payment",
    };
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

  /** Create a new Stripe Checkout session. */
  async createCheckout(customerEmail?: string): Promise<StripeCheckoutSession> {
    const params = new URLSearchParams();
    params.set("mode", this.config.mode ?? "payment");
    params.set("line_items[0][price]", this.config.priceId);
    params.set("line_items[0][quantity]", String(this.config.quantity ?? 1));
    params.set("success_url", this.config.successUrl);
    params.set("cancel_url", this.config.cancelUrl);
    if (customerEmail) params.set("customer_email", customerEmail);

    const data = await this.apiCall("POST", "/checkout/sessions", params);

    return {
      id: data.id,
      url: data.url ?? "",
      status: data.status ?? "",
    };
  }

  /** Check the payment status of a checkout session. */
  async getPaymentStatus(sessionId: string): Promise<string> {
    const data = await this.apiCall("GET", `/checkout/sessions/${sessionId}`);
    return data.payment_status;
  }

  /** Cancel a subscription at the end of the current billing period. */
  async cancelSubscription(subscriptionId: string): Promise<void> {
    const params = new URLSearchParams();
    params.set("cancel_at_period_end", "true");
    await this.apiCall("POST", `/subscriptions/${subscriptionId}`, params);
    this.emit("onSubscriptionCanceled", { subscriptionId });
  }

  /** Create a refund for a payment intent or charge. */
  async createRefund(paymentIntentId: string, amount?: number): Promise<{ id: string; status: string }> {
    const params = new URLSearchParams();
    params.set("payment_intent", paymentIntentId);
    if (amount !== undefined) params.set("amount", String(amount));
    const data = await this.apiCall("POST", "/refunds", params);
    return { id: data.id, status: data.status };
  }

  /** Verify and parse a Stripe webhook event. */
  handleWebhook(payload: string, signature: string): WebhookEvent {
    // Parse Stripe-Signature header
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

    // Compute expected signature
    const signedPayload = `${parts.timestamp}.${payload}`;
    const expected = createHmac("sha256", this.webhookSecret).update(signedPayload).digest("hex");

    // Timing-safe comparison
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

    // Check timestamp tolerance (5 minutes)
    const tolerance = 300;
    const ts = parseInt(parts.timestamp, 10);
    if (Math.abs(Math.floor(Date.now() / 1000) - ts) > tolerance) {
      throw new Error("Webhook timestamp too old");
    }

    const event = JSON.parse(payload);
    const obj = event.data?.object ?? {};

    switch (event.type) {
      case "checkout.session.completed":
        this.emit("onPaymentSuccess", {
          sessionId: obj.id ?? "",
          customerId: typeof obj.customer === "string" ? obj.customer : obj.customer?.id ?? "",
          amount: obj.amount_total ?? 0,
        });
        break;

      case "checkout.session.expired":
        this.emit("onPaymentFailed", {
          sessionId: obj.id ?? "",
          error: "Checkout session expired",
        });
        break;

      case "customer.subscription.created": {
        const items = obj.items?.data ?? [];
        this.emit("onSubscriptionCreated", {
          subscriptionId: obj.id ?? "",
          customerId: typeof obj.customer === "string" ? obj.customer : obj.customer?.id ?? "",
          priceId: items[0]?.price?.id ?? "",
        });
        break;
      }

      case "customer.subscription.deleted":
        this.emit("onSubscriptionCanceled", { subscriptionId: obj.id ?? "" });
        break;
    }

    return { type: event.type, data: obj };
  }

  private async apiCall(method: string, path: string, params?: URLSearchParams): Promise<any> {
    const url = method === "GET" && params
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

export default StripeCheckout;
