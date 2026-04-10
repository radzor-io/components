# @radzor/retry-handler — Usage Examples

## Basic retry with exponential backoff
```typescript
import { RetryHandler } from "@radzor/retry-handler";

const retry = new RetryHandler({ maxAttempts: 3, strategy: "exponential", baseDelay: 1000 });

const result = await retry.execute(async () => {
  const resp = await fetch("https://api.example.com/data");
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
});

if (result.success) {
  console.log("Got data:", result.data);
  console.log(`Took ${result.attempts} attempt(s) in ${result.totalTime}ms`);
} else {
  console.error("Failed:", result.lastError?.message);
  console.log("Delays used:", result.delays);
}
```

## Retry with custom error filtering
```typescript
const retry = new RetryHandler({
  maxAttempts: 5,
  strategy: "exponential",
  baseDelay: 500,
  retryOn: (error) => {
    // Only retry on network errors or 5xx
    if (error.message.includes("fetch failed")) return true;
    if (error.message.includes("HTTP 5")) return true;
    return false; // 4xx, validation errors — don't retry
  },
});

const result = await retry.execute(async () => {
  const resp = await fetch("https://api.example.com/submit", { method: "POST", body: "{}" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
});
```

## Linear backoff with no jitter
```typescript
const retry = new RetryHandler({
  maxAttempts: 4,
  strategy: "linear",
  baseDelay: 2000,
  jitter: false,
  maxDelay: 10000,
});

// Delays will be: 2000ms, 4000ms, 6000ms (capped at 10000ms)
const result = await retry.execute(someApiCall);
```

## Monitoring retries with events
```typescript
const retry = new RetryHandler({ maxAttempts: 5, strategy: "exponential", baseDelay: 1000 });

retry.on("onRetry", ({ attempt, delay, error }) => {
  console.warn(`[Retry] Attempt ${attempt} failed: ${error}. Next retry in ${delay}ms`);
});

retry.on("onExhausted", ({ attempts, lastError, totalTime }) => {
  console.error(`[Retry] Exhausted after ${attempts} attempts (${totalTime}ms): ${lastError}`);
  // Send alert to monitoring system
});

retry.on("onSuccess", ({ attempt, totalTime }) => {
  if (attempt > 1) {
    console.log(`[Retry] Recovered on attempt ${attempt} after ${totalTime}ms`);
  }
});
```

## Tracking retry statistics
```typescript
const retry = new RetryHandler({ maxAttempts: 3 });

// Execute several operations
await retry.execute(apiCall1);
await retry.execute(apiCall2);
await retry.execute(apiCall3);

const stats = retry.getStats();
console.log("Total executions:", stats.totalExecutions);
console.log("Success rate:", `${(stats.totalSuccesses / stats.totalExecutions * 100).toFixed(1)}%`);
console.log("Total retries:", stats.totalRetries);
console.log("Average attempts:", stats.averageAttempts.toFixed(2));

// Reset stats
retry.reset();
```

## Dynamic configuration update
```typescript
const retry = new RetryHandler({ maxAttempts: 3, strategy: "fixed", baseDelay: 1000 });

// Switch to exponential after deployment
retry.configure({
  strategy: "exponential",
  maxAttempts: 5,
  baseDelay: 500,
  maxDelay: 15000,
});
```

---

## Python Examples

### Basic exponential retry
```python
from retry_handler import RetryHandler

retry = RetryHandler(max_attempts=3, strategy="exponential", base_delay=1000)

result = await retry.execute(some_async_operation)
if result["success"]:
    print("Data:", result["data"])
else:
    print(f"Failed after {result['attempts']} attempts: {result['last_error']}")
```

### Custom retry predicate
```python
def should_retry(error):
    return "timeout" in str(error).lower() or "5" == str(error)[:1]

retry = RetryHandler(max_attempts=5, retry_on=should_retry)
result = await retry.execute(flaky_call)
```

### Statistics monitoring
```python
retry = RetryHandler(max_attempts=3)

for task in tasks:
    await retry.execute(task)

stats = retry.get_stats()
print(f"Success rate: {stats['total_successes'] / stats['total_executions'] * 100:.1f}%")
```
