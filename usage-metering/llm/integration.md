# How to integrate @radzor/usage-metering

## Overview
Track and bill usage-based metrics. Define named meters (e.g. API calls, storage GB, tokens), record usage events, query summaries, and trigger threshold alerts. Supports in-memory storage or Stripe Billing integration.

## Integration Steps

### TypeScript

1. **Import and configure**:
```typescript
import { UsageMetering } from "@radzor/usage-metering";

// In-memory mode (no Stripe required)
const metering = new UsageMetering({
  storageBackend: "memory",
});

// Or with Stripe Billing integration
const metering = new UsageMetering({
  secretKey: process.env.STRIPE_SECRET_KEY!,
  storageBackend: "stripe",
  flushIntervalMs: 60000,
});
```

2. **Define meters**:
```typescript
metering.createMeter("api_calls", "API Calls", "requests", 10000);
metering.createMeter("storage", "Storage Used", "gb");
```

3. **Record usage**:
```typescript
await metering.recordUsage("cus_abc123", "api_calls", 1);
await metering.recordUsage("cus_abc123", "storage", 0.5);
```

4. **Query usage**:
```typescript
const summary = await metering.getUsageSummary("cus_abc123", "api_calls");
console.log(summary.totalQuantity, summary.recordCount);
```

5. **Listen for threshold alerts**:
```typescript
metering.on("onThresholdReached", ({ meterId, customerId, currentUsage, threshold }) => {
  console.log(`${customerId} exceeded ${meterId}: ${currentUsage}/${threshold}`);
});
```

### Python

1. **Configure**:
```python
from usage_metering import UsageMetering

metering = UsageMetering(storage_backend="memory")
metering.create_meter("api_calls", "API Calls", "requests", threshold=10000)
```

2. **Record and query**:
```python
metering.record_usage("cus_abc123", "api_calls", 1)
summary = metering.get_usage_summary("cus_abc123", "api_calls")
print(summary.total_quantity)
```

3. **Threshold events**:
```python
metering.on("onThresholdReached", lambda e: print(f"Over limit: {e['currentUsage']}"))
```

## Environment Variables Required
- `STRIPE_SECRET_KEY` — Only required when `storageBackend` is `"stripe"`.

## Constraints
- In-memory storage is not persistent across server restarts.
- Meters must be created with `createMeter()` before recording usage.
- Threshold events fire once per threshold crossing per billing period.
- Call `resetPeriod()` at billing boundaries to reset aggregates.
- Call `destroy()` before shutdown to clean up the flush timer.

## Composability
- `onThresholdReached` event can trigger `@radzor/email-send` for overage alerts.
- Usage summaries can feed into `@radzor/invoice-generator` for usage-based invoices.
