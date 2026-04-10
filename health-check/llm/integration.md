# How to integrate @radzor/health-check

## Overview
This component provides a health check system that monitors registered dependencies (databases, APIs, caches) and produces a unified health report. Each dependency has a checker function, a criticality flag, and tracked history. The overall status is `healthy`, `degraded` (non-critical failure), or `unhealthy` (critical failure).

## Integration Steps

1. **Install**: Copy `src/index.ts` into your project or import from the package.

2. **Create an instance and register dependencies**:
```typescript
import { HealthChecker } from "@radzor/health-check";

const health = new HealthChecker({
  intervalMs: 30000,  // auto-check every 30s
  timeout: 5000,      // each check times out after 5s
  historySize: 100,   // keep last 100 results per dependency
});

// Register a critical dependency (failure = unhealthy)
health.registerDependency("postgres", async () => {
  const res = await fetch("http://localhost:5432/health");
  return res.ok;
}, true);

// Register a non-critical dependency (failure = degraded)
health.registerDependency("redis-cache", async () => {
  const res = await fetch("http://localhost:6379/ping");
  return res.ok;
}, false);
```

3. **Expose a health endpoint**:
```typescript
app.get("/health", async (req, res) => {
  const report = await health.check();
  const statusCode = report.status === "healthy" ? 200 : report.status === "degraded" ? 200 : 503;
  res.status(statusCode).json(report);
});
```

4. **Listen for status changes**:
```typescript
health.on("onUnhealthy", ({ failedDependencies }) => {
  alertOps(`Unhealthy: ${failedDependencies.join(", ")}`);
});
```

5. **Python equivalent**:
```python
import asyncio, time

class HealthChecker:
    def __init__(self, timeout=5.0):
        self.dependencies = {}
        self.timeout = timeout

    def register(self, name, checker, critical=True):
        self.dependencies[name] = {"checker": checker, "critical": critical}

    async def check(self):
        results = []
        for name, dep in self.dependencies.items():
            start = time.time()
            try:
                healthy = await asyncio.wait_for(dep["checker"](), timeout=self.timeout)
                results.append({"name": name, "healthy": healthy, "latencyMs": (time.time() - start) * 1000})
            except Exception as e:
                results.append({"name": name, "healthy": False, "error": str(e)})
        return results
```

## Environment Variables Required
No environment variables required.

## Constraints
- Each dependency check is wrapped in a timeout — checks exceeding `timeout` ms are treated as failures.
- The checker function must return `Promise<boolean>`.
- The auto-check timer is `unref()`'d and won't keep the process alive.
- History is in-memory; resets on process restart.
- A single critical failure makes the overall status `unhealthy`; only non-critical failures make it `degraded`.

## Composability
- Pipe `onUnhealthy` events into `@radzor/error-tracker` to report degradations.
- Combine with `@radzor/log-aggregator` to log health check results.
- Use alongside `@radzor/uptime-monitor` for external URL monitoring.
