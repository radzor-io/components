# @radzor/usage-metering — Usage Examples

## Basic API call metering
```typescript
import { UsageMetering } from "@radzor/usage-metering";

const metering = new UsageMetering({ storageBackend: "memory" });

metering.createMeter("api_calls", "API Calls", "requests", 10000);
metering.createMeter("tokens_used", "Tokens Used", "tokens", 1000000);

// Record each API call
app.use(async (req, res, next) => {
  const customerId = req.user.stripeCustomerId;
  await metering.recordUsage(customerId, "api_calls", 1);
  next();
});
```

## Threshold alerts for overage billing
```typescript
metering.createMeter("storage_gb", "Storage", "gb", 100);

metering.on("onThresholdReached", async ({ meterId, customerId, currentUsage, threshold }) => {
  console.log(`${customerId} exceeded ${meterId}: ${currentUsage}/${threshold}`);

  await emailService.send({
    to: await getCustomerEmail(customerId),
    subject: "Usage limit reached",
    html: `<p>You've used ${currentUsage} ${meterId}. Your limit is ${threshold}.</p>`,
  });
});

// Record 50 GB of storage usage
await metering.recordUsage("cus_123", "storage_gb", 50);
```

## Usage dashboard endpoint
```typescript
app.get("/api/usage/:customerId", async (req, res) => {
  const meters = metering.listMeters();
  const summaries = await Promise.all(
    meters.map(m => metering.getUsageSummary(req.params.customerId, m.meterId))
  );

  res.json(summaries.map(s => ({
    meter: s.meterId,
    used: s.totalQuantity,
    records: s.recordCount,
    period: { start: s.periodStart, end: s.periodEnd },
  })));
});
```

## Usage with custom time periods
```typescript
const summary = await metering.getUsageSummary(
  "cus_123",
  "api_calls",
  "2025-01-01T00:00:00Z",
  "2025-01-31T23:59:59Z"
);
console.log(`API calls in January: ${summary.totalQuantity}`);
```

## Stripe Billing integration
```typescript
const metering = new UsageMetering({
  secretKey: process.env.STRIPE_SECRET_KEY!,
  storageBackend: "stripe",
  flushIntervalMs: 30000, // flush every 30 seconds
});

metering.createMeter("api_calls", "API Calls", "requests");

// Usage is automatically reported to Stripe
await metering.recordUsage("cus_123", "api_calls", 1);

// Clean shutdown
process.on("SIGTERM", () => {
  metering.destroy();
});
```

## Monthly reset with billing cycle
```typescript
import { CronJob } from "cron";

// Reset at the start of each month
new CronJob("0 0 1 * *", () => {
  metering.resetPeriod();
  console.log("Usage counters reset for new billing period");
}).start();
```

---

## Python Examples

### Basic metering
```python
from usage_metering import UsageMetering

metering = UsageMetering(storage_backend="memory")
metering.create_meter("api_calls", "API Calls", "requests", threshold=10000)

# Record usage
metering.record_usage("cus_123", "api_calls", 1)
```

### Query usage summary
```python
summary = metering.get_usage_summary("cus_123", "api_calls")
print(f"Total API calls: {summary.total_quantity}")
print(f"Records: {summary.record_count}")
print(f"Period: {summary.period_start} to {summary.period_end}")
```

### Threshold alerts
```python
metering.on("onThresholdReached", lambda e: send_email(
    to=get_customer_email(e["customerId"]),
    subject="Usage limit reached",
    body=f"You've used {e['currentUsage']} of {e['threshold']} {e['meterId']}",
))
```

### FastAPI middleware
```python
from fastapi import FastAPI, Request

app = FastAPI()

@app.middleware("http")
async def track_usage(request: Request, call_next):
    response = await call_next(request)
    if request.state.user:
        metering.record_usage(request.state.user.customer_id, "api_calls", 1)
    return response
```
