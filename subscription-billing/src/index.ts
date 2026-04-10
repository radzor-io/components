// @radzor/subscription-billing — Manage recurring subscriptions with Stripe Billing

import { createHmac, timingSafeEqual } from "crypto";

const STRIPE_API = "https://api.stripe.com/v1";

export interface SubscriptionBillingConfig {
  secretKey: string;
  webhookSecret: string;
  defaultCurrency?: string;
}

export interface SubscriptionData {
  id: string;
  customerId: string;
  status: string;
  priceId: string;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
}

export type EventMap = {
  onSubscriptionCreated: {
    subscriptionId: string;
    customerId: string;
    priceId: string;
    status: string;
  };
  onSubscriptionCancelled: {
    subscriptionId: string;
    customerId: string;
    cancelAt: number;
  };
  onPaymentFailed: {
    subscriptionId: string;
    customerId: string;
    invoiceId: string;
    attemptCount: number;
  };
};

export type Listener<T> = (event: T) => void;

export class SubscriptionBilling {
  private secretKey: string;
  private webhookSecret: string;
  private defaultCurrency: string;
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: SubscriptionBillingConfig) {
    this.secretKey = config.secretKey;
    this.webhookSecret = config.webhookSecret;
    this.defaultCurrency = config.defaultCurrency ?? "usd";
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

  /** Create a new subscription for a customer. */
  async createSubscription(
    customerId: string,
    priceId: string,
    trialDays?: number
  ): Promise<SubscriptionData> {
    const params = new URLSearchParams();
    params.set("customer", customerId);
    params.set("items[0][price]", priceId);
    params.set("payment_behavior", "default_incomplete");
    params.set("expand[]", "latest_invoice.payment_intent");

    if (trialDays && trialDays > 0) {
      const trialEnd = Math.floor(Date.now() / 1000) + trialDays * 86400;
      params.set("trial_end", String(trialEnd));
    }

    const data = await this.apiCall("POST", "/subscriptions", params);
    const sub = this.mapSubscription(data);

    this.emit("onSubscriptionCreated", {
      subscriptionId: sub.id,
      customerId: sub.customerId,
      priceId: sub.priceId,
      status: sub.status,
    });

    return sub;
  }

  /** Cancel a subscription immediately or at the end of the billing period. */
  async cancelSubscription(
    subscriptionId: string,
    immediate?: boolean
  ): Promise<SubscriptionData> {
    let data: any;

    if (immediate) {
      data = await this.apiCall("DELETE", `/subscriptions/${subscriptionId}`);
    } else {
      const params = new URLSearchParams();
      params.set("cancel_at_period_end", "true");
      data = await this.apiCall("POST", `/subscriptions/${subscriptionId}`, params);
    }

    const sub = this.mapSubscription(data);

    this.emit("onSubscriptionCancelled", {
      subscriptionId: sub.id,
      customerId: sub.customerId,
      cancelAt: sub.currentPeriodEnd,
    });

    return sub;
  }

  /** Update a subscription (change plan or quantity). */
  async updateSubscription(
    subscriptionId: string,
    newPriceId?: string,
    quantity?: number
  ): Promise<SubscriptionData> {
    // First retrieve the subscription to get the item ID
    const current = await this.apiCall("GET", `/subscriptions/${subscriptionId}`);
    const itemId = current.items?.data?.[0]?.id;

    if (!itemId) {
      throw new Error("Subscription has no items to update");
    }

    const params = new URLSearchParams();
    params.set("proration_behavior", "create_prorations");

    if (newPriceId) {
      params.set("items[0][id]", itemId);
      params.set("items[0][price]", newPriceId);
    }

    if (quantity !== undefined) {
      params.set("items[0][id]", itemId);
      params.set("items[0][quantity]", String(quantity));
    }

    const data = await this.apiCall("POST", `/subscriptions/${subscriptionId}`, params);
    return this.mapSubscription(data);
  }

  /** List all subscriptions for a customer. */
  async listSubscriptions(
    customerId: string,
    status?: string
  ): Promise<SubscriptionData[]> {
    const params = new URLSearchParams();
    params.set("customer", customerId);
    params.set("limit", "100");

    if (status && status !== "all") {
      params.set("status", status);
    }

    const data = await this.apiCall("GET", "/subscriptions", params);
    const items: any[] = data.data ?? [];
    return items.map((item) => this.mapSubscription(item));
  }

  /** Verify and process a Stripe webhook event for subscription lifecycle. */
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
      case "customer.subscription.created": {
        const items = obj.items?.data ?? [];
        this.emit("onSubscriptionCreated", {
          subscriptionId: obj.id ?? "",
          customerId: typeof obj.customer === "string" ? obj.customer : "",
          priceId: items[0]?.price?.id ?? "",
          status: obj.status ?? "",
        });
        break;
      }

      case "customer.subscription.deleted":
        this.emit("onSubscriptionCancelled", {
          subscriptionId: obj.id ?? "",
          customerId: typeof obj.customer === "string" ? obj.customer : "",
          cancelAt: obj.canceled_at ?? Math.floor(Date.now() / 1000),
        });
        break;

      case "invoice.payment_failed":
        this.emit("onPaymentFailed", {
          subscriptionId: obj.subscription ?? "",
          customerId: typeof obj.customer === "string" ? obj.customer : "",
          invoiceId: obj.id ?? "",
          attemptCount: obj.attempt_count ?? 1,
        });
        break;
    }

    return { type: event.type, data: obj };
  }

  private mapSubscription(data: any): SubscriptionData {
    const items = data.items?.data ?? [];
    return {
      id: data.id,
      customerId: typeof data.customer === "string" ? data.customer : data.customer?.id ?? "",
      status: data.status ?? "",
      priceId: items[0]?.price?.id ?? items[0]?.plan?.id ?? "",
      currentPeriodEnd: data.current_period_end ?? 0,
      cancelAtPeriodEnd: data.cancel_at_period_end ?? false,
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

export default SubscriptionBilling;
