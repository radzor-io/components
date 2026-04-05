# How to integrate @radzor/circuit-breaker

## Overview
This component implements a closed/open/half-open state machine that wraps external calls. When failures exceed the threshold the circuit opens and rejects calls immediately, protecting downstream services. After a timeout it moves to half-open to probe recovery.

## Integration Steps

1. **Install**: Copy `src/index.ts` into your project or import from the package.

2. **Create one instance per dependency**:
```typescript
import { CircuitBreaker } from "@radzor/circuit-breaker";

const breaker = new CircuitBreaker({
  threshold: 5,           // failures before opening, default: 5
  timeout: 60000,         // ms before moving to half-open, default: 60000
  halfOpenRequests: 1,    // probes allowed in half-open, default: 1
  volumeThreshold: 10,    // min total requests before circuit can open, default: 10
});
```

3. **Listen for state changes**:
```typescript
breaker.on("onOpen", ({ from, timestamp }) => {
  console.warn("Circuit opened at", timestamp);
});

breaker.on("onHalfOpen", () => console.log("Probing recovery..."));
breaker.on("onClose", () => console.log("Circuit recovered"));

breaker.on("onRejected", ({ state }) => {
  metrics.increment("circuit.rejected", { state });
});
```

4. **Wrap every external call in execute()**:
```typescript
try {
  const data = await breaker.execute(() => fetch("https://api.example.com/data").then(r => r.json()));
} catch (err) {
  if (err instanceof CircuitOpenError) {
    // Return cached data or fallback
  }
  throw err;
}
```

5. **Inspect state and metrics**:
```typescript
console.log(breaker.getState());    // "closed" | "open" | "half-open"
console.log(breaker.getMetrics());  // { totalRequests, successCount, failureCount, ... }
```

## Constraints
- One instance per external dependency. Do not share across services.
- State is in-memory only; it does not persist across process restarts.
- `volumeThreshold` must be reached before the circuit can open — prevents false trips on startup.

## Composability
- Wrap `@radzor/http-client` calls in `execute()` for HTTP circuit breaking.
- Combine with `@radzor/cache-store` — return cached data when `CircuitOpenError` is thrown.
