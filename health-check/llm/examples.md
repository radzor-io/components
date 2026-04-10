# @radzor/health-check — Usage Examples

## Basic health endpoint
```typescript
import { HealthChecker } from "@radzor/health-check";
import express from "express";

const app = express();
const health = new HealthChecker({ timeout: 3000 });

health.registerDependency("database", async () => {
  const res = await fetch("http://localhost:5432/health");
  return res.ok;
});

health.registerDependency("cache", async () => {
  const res = await fetch("http://localhost:6379/ping");
  return res.ok;
}, false); // non-critical

app.get("/health", async (req, res) => {
  const report = await health.check();
  res.status(report.status === "unhealthy" ? 503 : 200).json(report);
});
```

## Kubernetes liveness and readiness probes
```typescript
const health = new HealthChecker({ intervalMs: 15000 });

health.registerDependency("postgres", async () => {
  const res = await pool.query("SELECT 1");
  return res.rows.length === 1;
}, true);

health.registerDependency("stripe-api", async () => {
  const res = await fetch("https://api.stripe.com/v1/balance", {
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
  });
  return res.ok;
}, false);

// Liveness: is the process alive?
app.get("/healthz", (req, res) => res.sendStatus(200));

// Readiness: are dependencies ready?
app.get("/readyz", async (req, res) => {
  const report = await health.check();
  res.status(report.status === "unhealthy" ? 503 : 200).json(report);
});
```

## Alerting on failures
```typescript
const health = new HealthChecker();

health.registerDependency("primary-db", async () => {
  const res = await fetch("http://db-primary:5432/health");
  return res.ok;
});

health.on("onUnhealthy", ({ failedDependencies, checkedAt }) => {
  const time = new Date(checkedAt).toISOString();
  console.error(`[${time}] UNHEALTHY: ${failedDependencies.join(", ")}`);
  // Send to PagerDuty, Slack, etc.
});

health.on("onHealthy", ({ checkedAt }) => {
  console.log(`[${new Date(checkedAt).toISOString()}] All systems healthy`);
});
```

## Checking dependency history
```typescript
const health = new HealthChecker({ historySize: 50 });

health.registerDependency("redis", async () => {
  const res = await fetch("http://redis:6379/ping");
  return res.ok;
});

// After some time...
const history = health.getHistory("redis");
const uptime = history.filter((h) => h.healthy).length / history.length;
console.log(`Redis uptime: ${(uptime * 100).toFixed(1)}%`);

const avgLatency = history.reduce((sum, h) => sum + h.latencyMs, 0) / history.length;
console.log(`Redis avg latency: ${avgLatency.toFixed(0)}ms`);
```

## Custom checker with database query
```typescript
import { HealthChecker } from "@radzor/health-check";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const health = new HealthChecker();

health.registerDependency("postgres", async () => {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    return true;
  } catch {
    return false;
  }
}, true);

health.registerDependency("external-api", async () => {
  const res = await fetch("https://api.example.com/status");
  return res.status === 200;
}, false);
```

---

## Python Examples

### FastAPI health endpoint
```python
from fastapi import FastAPI, Response
from health_check import HealthChecker

app = FastAPI()
health = HealthChecker(timeout=3.0)

async def check_db():
    # Simulate DB check
    return True

health.register("database", check_db, critical=True)

@app.get("/health")
async def health_endpoint(response: Response):
    report = await health.check()
    if report["status"] == "unhealthy":
        response.status_code = 503
    return report
```

### Django management command
```python
import asyncio
from django.core.management.base import BaseCommand
from health_check import HealthChecker

class Command(BaseCommand):
    def handle(self, *args, **kwargs):
        health = HealthChecker()
        health.register("db", self.check_db, critical=True)
        report = asyncio.run(health.check())
        for dep in report["dependencies"]:
            status = "OK" if dep["healthy"] else "FAIL"
            self.stdout.write(f"{dep['name']}: {status} ({dep['latencyMs']:.0f}ms)")

    async def check_db(self):
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return True
```
