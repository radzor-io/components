// @radzor/usage-metering — Track and bill usage-based metrics

const STRIPE_API = "https://api.stripe.com/v1";

export interface UsageMeteringConfig {
  secretKey?: string;
  flushIntervalMs?: number;
  storageBackend?: "memory" | "stripe";
}

export interface MeterDefinition {
  meterId: string;
  displayName: string;
  unit: string;
  threshold?: number;
}

export interface UsageRecord {
  customerId: string;
  meterId: string;
  quantity: number;
  timestamp: string;
}

export interface UsageSummary {
  meterId: string;
  customerId: string;
  totalQuantity: number;
  periodStart: string;
  periodEnd: string;
  recordCount: number;
}

export type EventMap = {
  onThresholdReached: {
    meterId: string;
    customerId: string;
    currentUsage: number;
    threshold: number;
  };
};

export type Listener<T> = (event: T) => void;

export class UsageMetering {
  private config: Required<UsageMeteringConfig>;
  private meters: Map<string, MeterDefinition> = new Map();
  private records: UsageRecord[] = [];
  private aggregates: Map<string, number> = new Map();
  private thresholdFired: Set<string> = new Set();
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: UsageMeteringConfig = {}) {
    this.config = {
      secretKey: config.secretKey ?? "",
      flushIntervalMs: config.flushIntervalMs ?? 60000,
      storageBackend: config.storageBackend ?? "memory",
    };

    if (this.config.storageBackend === "stripe" && !this.config.secretKey) {
      throw new Error("Stripe secret key is required when using 'stripe' storage backend");
    }

    if (this.config.flushIntervalMs > 0 && this.config.storageBackend === "stripe") {
      this.flushTimer = setInterval(() => this.flush(), this.config.flushIntervalMs);
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

  /** Create a named meter with optional threshold for alerts. */
  createMeter(
    meterId: string,
    displayName: string,
    unit: string,
    threshold?: number
  ): void {
    if (this.meters.has(meterId)) {
      throw new Error(`Meter "${meterId}" already exists`);
    }

    this.meters.set(meterId, { meterId, displayName, unit, threshold });
  }

  /** Record a usage event against a meter for a customer. */
  async recordUsage(
    customerId: string,
    meterId: string,
    quantity: number = 1
  ): Promise<void> {
    const meter = this.meters.get(meterId);
    if (!meter) {
      throw new Error(`Meter "${meterId}" not found. Create it first with createMeter().`);
    }

    if (quantity <= 0) {
      throw new Error("Quantity must be positive");
    }

    const record: UsageRecord = {
      customerId,
      meterId,
      quantity,
      timestamp: new Date().toISOString(),
    };

    this.records.push(record);

    // Update aggregate
    const aggKey = `${customerId}:${meterId}`;
    const current = (this.aggregates.get(aggKey) ?? 0) + quantity;
    this.aggregates.set(aggKey, current);

    // Check threshold
    if (meter.threshold && current >= meter.threshold) {
      const firedKey = `${aggKey}:${this.getCurrentPeriodKey()}`;
      if (!this.thresholdFired.has(firedKey)) {
        this.thresholdFired.add(firedKey);
        this.emit("onThresholdReached", {
          meterId,
          customerId,
          currentUsage: current,
          threshold: meter.threshold,
        });
      }
    }

    // Report to Stripe if configured
    if (this.config.storageBackend === "stripe") {
      await this.reportToStripe(customerId, meterId, quantity);
    }
  }

  /** Get aggregated usage for a customer and meter over a time period. */
  async getUsageSummary(
    customerId: string,
    meterId: string,
    periodStart?: string,
    periodEnd?: string
  ): Promise<UsageSummary> {
    const meter = this.meters.get(meterId);
    if (!meter) {
      throw new Error(`Meter "${meterId}" not found.`);
    }

    const start = periodStart ? new Date(periodStart) : this.getDefaultPeriodStart();
    const end = periodEnd ? new Date(periodEnd) : new Date();

    const filtered = this.records.filter((r) => {
      if (r.customerId !== customerId || r.meterId !== meterId) return false;
      const ts = new Date(r.timestamp);
      return ts >= start && ts <= end;
    });

    const totalQuantity = filtered.reduce((sum, r) => sum + r.quantity, 0);

    return {
      meterId,
      customerId,
      totalQuantity,
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      recordCount: filtered.length,
    };
  }

  /** Get all meters. */
  listMeters(): MeterDefinition[] {
    return Array.from(this.meters.values());
  }

  /** Reset usage aggregates (typically called at billing period boundaries). */
  resetPeriod(): void {
    this.aggregates.clear();
    this.thresholdFired.clear();
  }

  /** Stop the flush timer. Call this before shutting down. */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /** Flush pending usage records to Stripe. */
  private async flush(): Promise<void> {
    if (this.config.storageBackend !== "stripe") return;

    // In a real implementation, this would batch-send any pending records
    // that failed to send individually. For now, records are sent immediately
    // in recordUsage(), so flush is a no-op unless records were queued due
    // to transient failures.
  }

  /** Report a single usage record to Stripe's metered billing API. */
  private async reportToStripe(
    customerId: string,
    meterId: string,
    quantity: number
  ): Promise<void> {
    // Stripe expects subscription item IDs for metered billing.
    // First, look up the customer's subscription with the matching price.
    const params = new URLSearchParams();
    params.set("customer", customerId);
    params.set("status", "active");
    params.set("limit", "10");

    const subsRes = await fetch(`${STRIPE_API}/subscriptions?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${this.config.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const subsData = await subsRes.json();
    if (subsData.error) {
      throw new Error(`Stripe API error: ${subsData.error.message}`);
    }

    // Find a subscription item that matches the meter ID as a metadata key
    const subscriptions: any[] = subsData.data ?? [];
    let subscriptionItemId: string | null = null;

    for (const sub of subscriptions) {
      const items: any[] = sub.items?.data ?? [];
      for (const item of items) {
        if (item.price?.lookup_key === meterId || item.price?.metadata?.meter_id === meterId) {
          subscriptionItemId = item.id;
          break;
        }
      }
      if (subscriptionItemId) break;
    }

    if (!subscriptionItemId) {
      // If no matching subscription item found, skip Stripe reporting
      return;
    }

    // Report usage to Stripe
    const usageParams = new URLSearchParams();
    usageParams.set("quantity", String(quantity));
    usageParams.set("timestamp", String(Math.floor(Date.now() / 1000)));
    usageParams.set("action", "increment");

    const usageRes = await fetch(
      `${STRIPE_API}/subscription_items/${subscriptionItemId}/usage_records`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: usageParams.toString(),
      }
    );

    const usageData = await usageRes.json();
    if (usageData.error) {
      throw new Error(`Stripe usage report error: ${usageData.error.message}`);
    }
  }

  private getCurrentPeriodKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  private getDefaultPeriodStart(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
}

export default UsageMetering;
