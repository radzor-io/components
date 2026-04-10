# @radzor/log-aggregator — Usage Examples

## Basic structured logging
```typescript
import { LogAggregator } from "@radzor/log-aggregator";

const logger = new LogAggregator({
  level: "info",
  defaultMeta: { service: "user-api" },
});

logger.info("User created", { userId: "u_42", email: "alice@example.com" });
logger.warn("Rate limit approaching", { key: "u_42", remaining: 5 });
logger.error("Database connection failed", { host: "db.internal", retries: 3 });

// Output (JSON to console):
// {"level":"info","message":"User created","timestamp":"2025-01-15T10:30:00Z","meta":{"service":"user-api","userId":"u_42","email":"alice@example.com"}}
```

## Multiple transports
```typescript
const logger = new LogAggregator({
  level: "debug",
  defaultMeta: { service: "payment-worker", env: "production" },
  transports: [
    { type: "console" },
    { type: "http", url: "https://logs.example.com/ingest", headers: { Authorization: "Bearer ..." } },
    { type: "http", url: "https://datadog.example.com/v1/input", level: "error" }, // only errors to Datadog
  ],
});

logger.debug("Processing job", { jobId: "j_99" }); // console only
logger.error("Job failed", { jobId: "j_99", error: "timeout" }); // console + both HTTP
```

## Child loggers
```typescript
const logger = new LogAggregator({
  level: "info",
  defaultMeta: { service: "api" },
});

const authLogger = logger.child({ module: "auth" });
const dbLogger = logger.child({ module: "db" });

authLogger.info("Login successful", { userId: "u_1" });
// meta: { service: "api", module: "auth", userId: "u_1" }

dbLogger.warn("Slow query", { durationMs: 850, query: "SELECT ..." });
// meta: { service: "api", module: "db", durationMs: 850, query: "SELECT ..." }
```

## Custom transport (write to file)
```typescript
import { LogAggregator } from "@radzor/log-aggregator";
import { appendFileSync } from "fs";

const logger = new LogAggregator({ level: "info" });

logger.addTransport({
  name: "file",
  write(entry) {
    appendFileSync("/var/log/app.jsonl", JSON.stringify(entry) + "\n");
  },
});

logger.info("Application started");
// Written to both console and /var/log/app.jsonl
```

## Changing log level at runtime
```typescript
const logger = new LogAggregator({ level: "info" });

logger.debug("This is hidden"); // discarded

// Admin endpoint to change log level
app.post("/admin/log-level", (req, res) => {
  const { level } = req.body;
  logger.setLevel(level);
  res.json({ level: logger.getLevel() });
});

// After setting level to "debug"
logger.debug("Now this is visible");
```

## Express request logging middleware
```typescript
import express from "express";
import { LogAggregator } from "@radzor/log-aggregator";

const app = express();
const logger = new LogAggregator({
  level: "info",
  defaultMeta: { service: "web" },
});

app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";

    logger.log(level, `${req.method} ${req.path} ${res.statusCode}`, {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: duration,
      ip: req.ip,
    });
  });

  next();
});
```

---

## Python Examples

### Basic logging
```python
from log_aggregator import LogAggregator

logger = LogAggregator(level="info", default_meta={"service": "worker"})

logger.info("Task started", task_id="t_1")
logger.error("Task failed", task_id="t_1", error="connection reset")
```

### File transport
```python
import json

class FileTransport:
    def __init__(self, path):
        self.path = path

    def write(self, entry):
        with open(self.path, "a") as f:
            f.write(json.dumps(entry) + "\n")

logger = LogAggregator(level="info")
logger.add_transport(FileTransport("/var/log/app.jsonl"))
logger.info("Application started")
```

### Django middleware
```python
import time
from log_aggregator import LogAggregator

logger = LogAggregator(level="info", default_meta={"service": "django-app"})

class RequestLoggingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        start = time.time()
        response = self.get_response(request)
        duration = (time.time() - start) * 1000

        level = "error" if response.status_code >= 500 else "info"
        logger.log(level, f"{request.method} {request.path} {response.status_code}", {
            "durationMs": round(duration),
            "status": response.status_code,
        })
        return response
```
