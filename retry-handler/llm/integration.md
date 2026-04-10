# How to integrate @radzor/retry-handler

## Overview
This component wraps any async operation with configurable retry logic. It supports exponential, linear, and fixed backoff strategies with optional jitter to prevent thundering herd. It tracks statistics across all executions and emits events for monitoring.

## Integration Steps

1. **Install**: Copy `src/index.ts` into your project or import from the package.

2. **Create a retry handler instance**:
```typescript
import { RetryHandler } from "@radzor/retry-handler";

const retry = new RetryHandler({
  maxAttempts: 3,          // total attempts including the first
  strategy: "exponential", // "exponential" | "linear" | "fixed"
  baseDelay: 1000,         // ms before first retry
  maxDelay: 30000,         // cap on computed delay
  jitter: true,            // randomise delay ±25%
});
```

3. **Execute an operation with retries**:
```typescript
const result = await retry.execute(async () => {
  const resp = await fetch("https://api.example.com/data");
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
});

if (result.success) {
  console.log("Data:", result.data);
} else {
  console.error("All attempts failed:", result.lastError?.message);
}
```

4. **Listen for retry events**:
```typescript
retry.on("onRetry", ({ attempt, delay, error }) => {
  console.warn(`Attempt ${attempt} failed: ${error}. Retrying in ${delay}ms`);
});

retry.on("onExhausted", ({ attempts, lastError }) => {
  alert(`Operation failed after ${attempts} attempts: ${lastError}`);
});

retry.on("onSuccess", ({ attempt, totalTime }) => {
  console.log(`Succeeded on attempt ${attempt} in ${totalTime}ms`);
});
```

5. **Filter retryable errors**:
```typescript
const retry = new RetryHandler({
  maxAttempts: 5,
  retryOn: (error) => {
    // Only retry on network or 5xx errors
    if (error.message.includes("fetch failed")) return true;
    if (error.message.includes("HTTP 5")) return true;
    return false; // don't retry 4xx, validation errors, etc.
  },
});
```

6. **Python equivalent**:
```python
from retry_handler import RetryHandler

retry = RetryHandler(max_attempts=3, strategy="exponential", base_delay=1000)

result = await retry.execute(some_async_operation)
if result["success"]:
    print("Data:", result["data"])
else:
    print("Failed:", result["last_error"])
```

## Environment Variables Required
None. This component has no external dependencies.

## Constraints
- Delays use `setTimeout`; not suitable for sub-millisecond precision.
- The `retryOn` predicate should be a pure function — it receives the error and returns a boolean.
- Statistics are cumulative and in-memory only; call `reset()` to clear them.
- `maxAttempts` includes the initial attempt: setting it to 1 means no retries.

## Composability
- Wrap inside `@radzor/circuit-breaker` to combine retry logic with circuit-breaking.
- Use `@radzor/workflow-engine` steps with this handler for workflow-level retries.
- Connect `onExhausted` event to `@radzor/notification-hub` for alerting.
