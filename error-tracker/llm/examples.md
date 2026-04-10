# @radzor/error-tracker — Usage Examples

## Basic error capture
```typescript
import { ErrorTracker } from "@radzor/error-tracker";

const errors = new ErrorTracker({
  endpoint: "https://errors.example.com/api/report",
  environment: "production",
});

try {
  const data = JSON.parse(invalidJson);
} catch (err) {
  await errors.captureException(err as Error);
}
```

## Enriching with user context
```typescript
const errors = new ErrorTracker({
  endpoint: process.env.ERROR_TRACKER_ENDPOINT!,
  dsn: process.env.ERROR_TRACKER_DSN,
});

// Set user context after authentication
errors.setContext("user", {
  id: user.id,
  email: user.email,
  plan: user.plan,
});

errors.setContext("app", {
  version: "3.2.1",
  deployment: "canary",
});

// All subsequent reports include this context
await errors.captureException(new Error("Payment failed"), {
  orderId: "ord_123",
  amount: 99.99,
});
```

## Breadcrumb trail
```typescript
const errors = new ErrorTracker({
  endpoint: "https://errors.example.com/api/report",
  maxBreadcrumbs: 30,
});

// Add breadcrumbs as the user interacts
errors.addBreadcrumb({ category: "auth", message: "User logged in" });
errors.addBreadcrumb({ category: "navigation", message: "Opened /dashboard" });
errors.addBreadcrumb({
  category: "api",
  message: "GET /api/projects",
  level: "info",
  data: { status: 200, duration: 120 },
});
errors.addBreadcrumb({
  category: "api",
  message: "POST /api/projects/new",
  level: "error",
  data: { status: 500 },
});

// Breadcrumbs are included in the error report
await errors.captureException(new Error("Failed to create project"));
```

## Express error middleware
```typescript
import express from "express";
import { ErrorTracker } from "@radzor/error-tracker";

const app = express();
const errors = new ErrorTracker({
  endpoint: process.env.ERROR_TRACKER_ENDPOINT!,
});

// Add request breadcrumbs
app.use((req, res, next) => {
  errors.addBreadcrumb({
    category: "http",
    message: `${req.method} ${req.path}`,
    data: { query: req.query, ip: req.ip },
  });
  next();
});

// Error handler (must be last)
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  errors.captureException(err, {
    method: req.method,
    url: req.url,
    body: req.body,
  });
  res.status(500).json({ error: "Internal server error" });
});
```

## Capturing messages with severity levels
```typescript
const errors = new ErrorTracker({
  endpoint: "https://errors.example.com/api/report",
});

// Warning: non-critical issue
await errors.captureMessage("Slow query detected: 3200ms", "warning");

// Fatal: the process is about to crash
process.on("uncaughtException", async (err) => {
  await errors.captureException(err);
  process.exit(1);
});

// Or use the built-in global handler
errors.installGlobalHandler();
```

## Listening for captured errors
```typescript
const errors = new ErrorTracker({
  endpoint: "https://errors.example.com/api/report",
});

errors.on("onErrorCaptured", ({ id, level, message, sent }) => {
  if (!sent) {
    console.error(`Failed to report error ${id}: ${message}`);
    // Write to local log file as fallback
  }
});
```

---

## Python Examples

### Basic usage
```python
from error_tracker import ErrorTracker

tracker = ErrorTracker(
    endpoint="https://errors.example.com/api/report",
    environment="production",
)

try:
    result = 1 / 0
except Exception as e:
    report_id = tracker.capture_exception(e)
    print(f"Reported: {report_id}")
```

### Flask error handler
```python
from flask import Flask
from error_tracker import ErrorTracker

app = Flask(__name__)
tracker = ErrorTracker(
    endpoint="https://errors.example.com/api/report",
    dsn="my-service-dsn",
)

@app.errorhandler(Exception)
def handle_error(error):
    tracker.set_context("request", {
        "method": request.method,
        "url": request.url,
    })
    tracker.capture_exception(error)
    return {"error": "Internal server error"}, 500
```

### Breadcrumbs in async code
```python
import asyncio
from error_tracker import ErrorTracker

tracker = ErrorTracker(endpoint="https://errors.example.com/api/report")

async def process_order(order_id):
    tracker.add_breadcrumb(category="order", message=f"Processing {order_id}")
    # ... processing logic ...
    tracker.add_breadcrumb(category="payment", message="Charging card")
    try:
        await charge_card(order_id)
    except Exception as e:
        tracker.capture_exception(e, extra={"order_id": order_id})
```
