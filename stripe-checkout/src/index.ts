// @radzor/stripe-checkout — Stripe payment integration

import Stripe from "stripe";

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
  private stripe: Stripe;
  private config: StripeCheckoutConfig;
  private webhookSecret: string;
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: StripeCheckoutConfig & { secretKey: string; webhookSecret: string }) {
    this.stripe = new Stripe(config.secretKey);
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
    const session = await this.stripe.checkout.sessions.create({
      mode: this.config.mode,
      line_items: [
        {
          price: this.config.priceId,
          quantity: this.config.quantity,
        },
      ],
      success_url: this.config.successUrl,
      cancel_url: this.config.cancelUrl,
      ...(customerEmail && { customer_email: customerEmail }),
    });

    return {
      id: session.id,
      url: session.url!,
      status: session.status!,
    };
  }

  /** Check the payment status of a checkout session. */
  async getPaymentStatus(sessionId: string): Promise<string> {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId);
    return session.payment_status;
  }

  /** Cancel a subscription at the end of the current billing period. */
  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    this.emit("onSubscriptionCanceled", { subscriptionId });
  }

  /** Verify and parse a Stripe webhook event. */
  async handleWebhook(payload: string, signature: string): Promise<WebhookEvent> {
    const event = this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        this.emit("onPaymentSuccess", {
          sessionId: session.id,
          customerId: session.customer as string,
          amount: session.amount_total ?? 0,
        });
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        this.emit("onPaymentFailed", {
          sessionId: session.id,
          error: "Checkout session expired",
        });
        break;
      }

      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        const item = sub.items.data[0];
        this.emit("onSubscriptionCreated", {
          subscriptionId: sub.id,
          customerId: sub.customer as string,
          priceId: item?.price?.id ?? "",
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        this.emit("onSubscriptionCanceled", {
          subscriptionId: sub.id,
        });
        break;
      }
    }

    return {
      type: event.type,
      data: event.data.object as unknown as Record<string, unknown>,
    };
  }
}

export default StripeCheckout;
