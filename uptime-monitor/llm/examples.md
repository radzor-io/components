# @radzor/uptime-monitor — Usage Examples

## Basic uptime monitoring
```typescript
import { UptimeMonitor } from "@radzor/uptime-monitor";

const monitor = new UptimeMonitor({ intervalMs: 30000 });

monitor.addTarget("https://api.example.com/health", "API");
monitor.addTarget("https://www.example.com", "Website");

monitor.on("onDown", ({ url, error }) => {
  console.error(`${url} is DOWN: ${error}`);
});

monitor.on("onRecovered", ({ url, downtimeMs }) => {
  console.log(`${url} recovered after ${Math.round(downtimeMs / 1000)}s`);
});
```

## Status dashboard endpoint
```typescript
import express from "express";
import { UptimeMonitor } from "@radzor/uptime-monitor";

const app = express();
const monitor = new UptimeMonitor({
  intervalMs: 60000,
  latencyThresholdMs: 1500,
});

monitor.addTarget("https://api.example.com/health", "API");
monitor.addTarget("https://cdn.example.com/ping", "CDN");
monitor.addTarget("https://db.example.com/health", "Database");

app.get("/status", (req, res) => {
  const reports = monitor.getStatus() as Array<any>;
  const allUp = reports.every((r) => r.status === "up");

  res.status(allUp ? 200 : 503).json({
    overall: allUp ? "operational" : "degraded",
    services: reports.map((r) => ({
      name: r.name,
      status: r.status,
      uptime: `${r.uptimePercent}%`,
      latency: `${r.latencyMs}ms`,
    })),
  });
});
```

## Slack alerting on downtime
```typescript
const monitor = new UptimeMonitor({ intervalMs: 30000, timeout: 5000 });

monitor.addTarget("https://production.example.com", "Production");

monitor.on("onDown", async ({ url, error, consecutiveFailures }) => {
  // Only alert after 3 consecutive failures to avoid flapping
  if (consecutiveFailures === 3) {
    await fetch(process.env.SLACK_WEBHOOK_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `:red_circle: ${url} is DOWN after ${consecutiveFailures} checks — ${error}`,
      }),
    });
  }
});

monitor.on("onRecovered", async ({ url, downtimeMs }) => {
  await fetch(process.env.SLACK_WEBHOOK_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `:large_green_circle: ${url} recovered after ${Math.round(downtimeMs / 1000)}s`,
    }),
  });
});
```

## Latency monitoring
```typescript
const monitor = new UptimeMonitor({
  intervalMs: 15000,
  latencyThresholdMs: 500, // alert if > 500ms
});

monitor.addTarget("https://api.example.com/v1/ping", "API v1");

monitor.on("onLatencySpike", ({ url, latencyMs, threshold }) => {
  console.warn(`[SLOW] ${url}: ${latencyMs}ms (threshold: ${threshold}ms)`);
});
```

## Pause and resume monitoring
```typescript
const monitor = new UptimeMonitor();
monitor.addTarget("https://api.example.com", "API");
monitor.addTarget("https://staging.example.com", "Staging");

// Pause a specific target during maintenance
monitor.pause("https://staging.example.com");

// Resume after maintenance
monitor.resume("https://staging.example.com");

// Pause all monitoring
monitor.pause();

// Resume all
monitor.resume();
```

## Graceful shutdown
```typescript
const monitor = new UptimeMonitor();
monitor.addTarget("https://api.example.com/health", "API");

process.on("SIGTERM", () => {
  console.log("Shutting down monitor...");
  monitor.destroy(); // stops all timers and clears targets
  process.exit(0);
});
```

---

## Python Examples

### Basic monitoring
```python
import asyncio
from uptime_monitor import UptimeMonitor

monitor = UptimeMonitor(interval=30, timeout=5)
monitor.add_target("https://api.example.com/health", name="API")

async def run():
    while True:
        for url in monitor.targets:
            result = await monitor.check(url)
            if not result["ok"]:
                print(f"DOWN: {url}")
        await asyncio.sleep(monitor.interval)

asyncio.run(run())
```

### FastAPI status page
```python
from fastapi import FastAPI
from uptime_monitor import UptimeMonitor

app = FastAPI()
monitor = UptimeMonitor(interval=60)
monitor.add_target("https://api.example.com/health", name="API")
monitor.add_target("https://cdn.example.com/ping", name="CDN")

@app.get("/status")
async def status():
    reports = monitor.get_all_status()
    return {
        "overall": "operational" if all(r["status"] == "up" for r in reports) else "degraded",
        "services": reports,
    }
```

### Alerting with downtime tracking
```python
import time
from uptime_monitor import UptimeMonitor

monitor = UptimeMonitor(interval=30)
monitor.add_target("https://production.example.com", name="Prod")

def on_down(url, error, consecutive_failures):
    if consecutive_failures >= 3:
        send_pagerduty_alert(f"{url} is down: {error}")

def on_recovered(url, downtime_seconds):
    send_slack_message(f"{url} recovered after {downtime_seconds:.0f}s")

monitor.on_down = on_down
monitor.on_recovered = on_recovered
```
