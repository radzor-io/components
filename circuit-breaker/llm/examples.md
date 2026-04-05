# @radzor/circuit-breaker — Usage Examples

## Basic wrapping of an HTTP call
```typescript
import { CircuitBreaker, CircuitOpenError } from "@radzor/circuit-breaker";

const breaker = new CircuitBreaker({ threshold: 3, timeout: 30000 });

async function getUser(id: string) {
  try {
    return await breaker.execute(() =>
      fetch(`https://api.example.com/users/${id}`).then((r) => r.json())
    );
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return { id, name: "Unknown", cached: true };
    }
    throw err;
  }
}
```

## Monitoring state transitions
```typescript
const breaker = new CircuitBreaker({ threshold: 5, volumeThreshold: 10 });

breaker.on("onOpen", ({ timestamp }) => {
  console.error("Downstream service failed — circuit open", new Date(timestamp));
  alertTeam("circuit-breaker-open");
});

breaker.on("onHalfOpen", () => console.log("Testing recovery..."));
breaker.on("onClose", () => console.log("Service recovered"));
breaker.on("onError", ({ message }) => console.warn("Call failed:", message));
```

## Metrics dashboard
```typescript
const breaker = new CircuitBreaker();

setInterval(() => {
  const m = breaker.getMetrics();
  const errorRate = m.totalRequests > 0 ? m.failureCount / m.totalRequests : 0;
  console.log({
    state: breaker.getState(),
    errorRate: `${(errorRate * 100).toFixed(1)}%`,
    rejected: m.rejectedCount,
  });
}, 5000);
```

## Wrapping a database call with fallback cache
```typescript
import { CircuitBreaker, CircuitOpenError } from "@radzor/circuit-breaker";

const dbBreaker = new CircuitBreaker({ threshold: 3, timeout: 15000, volumeThreshold: 5 });
const cache = new Map<string, unknown>();

async function query(sql: string, params: unknown[]) {
  const key = sql + JSON.stringify(params);
  try {
    const result = await dbBreaker.execute(() => db.query(sql, params));
    cache.set(key, result);
    return result;
  } catch (err) {
    if (err instanceof CircuitOpenError && cache.has(key)) {
      console.warn("Serving stale cache due to open circuit");
      return cache.get(key);
    }
    throw err;
  }
}
```

## Manual reset after deployment
```typescript
const breaker = new CircuitBreaker({ threshold: 5 });

// After deploying a fix, force-close the circuit
app.post("/admin/reset-circuit", (req, res) => {
  breaker.reset();
  res.json({ state: breaker.getState(), metrics: breaker.getMetrics() });
});
```
