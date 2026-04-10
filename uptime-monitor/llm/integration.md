# How to integrate @radzor/uptime-monitor

## Overview
This component monitors URLs for uptime, tracks response latency, detects status transitions (up/down/recovered), and fires events for alerting. Supports multiple targets with independent check intervals, pause/resume, and configurable latency thresholds. Zero dependencies — uses raw `fetch()`.

## Integration Steps

1. **Install**: Copy `src/index.ts` into your project or import from the package.

2. **Create an instance and add targets**:
```typescript
import { UptimeMonitor } from "@radzor/uptime-monitor";

const monitor = new UptimeMonitor({
  intervalMs: 60000,          // check every 60s by default
  timeout: 10000,             // 10s request timeout
  latencyThresholdMs: 2000,   // alert if > 2s
});

monitor.addTarget("https://api.example.com/health", "API");
monitor.addTarget("https://www.example.com", "Website", 30000); // check every 30s
monitor.addTarget("https://db.example.com/ping", "Database");
```

3. **Listen for events**:
```typescript
monitor.on("onDown", ({ url, error, consecutiveFailures }) => {
  console.error(`DOWN: ${url} — ${error} (${consecutiveFailures} failures)`);
  sendSlackAlert(`${url} is down: ${error}`);
});

monitor.on("onRecovered", ({ url, downtimeMs }) => {
  console.log(`RECOVERED: ${url} after ${(downtimeMs / 1000).toFixed(0)}s`);
});

monitor.on("onLatencySpike", ({ url, latencyMs, threshold }) => {
  console.warn(`SLOW: ${url} responded in ${latencyMs}ms (threshold: ${threshold}ms)`);
});
```

4. **Check status programmatically**:
```typescript
const report = monitor.getStatus("https://api.example.com/health");
console.log(`${report.name}: ${report.status}, uptime: ${report.uptimePercent}%`);

// All targets
const all = monitor.getStatus() as UptimeReport[];
```

5. **Python equivalent**:
```python
import asyncio, aiohttp, time

class UptimeMonitor:
    def __init__(self, interval=60, timeout=10, latency_threshold=2.0):
        self.interval = interval
        self.timeout = timeout
        self.latency_threshold = latency_threshold
        self.targets = {}

    async def check(self, url):
        start = time.time()
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=self.timeout)) as resp:
                    latency = (time.time() - start) * 1000
                    return {"ok": resp.status < 500, "latencyMs": latency}
        except Exception:
            return {"ok": False, "latencyMs": (time.time() - start) * 1000}
```

## Environment Variables Required
No environment variables required.

## Constraints
- A target is considered "down" if `fetch()` throws (network error, timeout) or the HTTP status is >= 500. Status codes 2xx-4xx are considered "up".
- Check intervals use `setInterval` with `unref()` — they won't keep the process alive.
- The first check runs immediately when `addTarget()` is called.
- `onDown` fires on every failed check (not just the first failure). Use `consecutiveFailures` to decide alerting thresholds.
- `onRecovered` fires once when a target transitions from down to up.

## Composability
- Pipe `onDown` events into `@radzor/error-tracker` for incident tracking.
- Use `@radzor/log-aggregator` to log all check results.
- Combine with `@radzor/health-check` for internal dependency monitoring alongside external URL monitoring.
