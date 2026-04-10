# How to integrate @radzor/error-tracker

## Overview
This component captures exceptions and messages, enriches them with context and breadcrumbs, and sends structured JSON reports to a configurable HTTP endpoint (Sentry-style). Works in both browsers and Node.js. Zero dependencies — uses raw `fetch()`.

## Integration Steps

1. **Install**: Copy `src/index.ts` into your project or import from the package.

2. **Create an instance**:
```typescript
import { ErrorTracker } from "@radzor/error-tracker";

const errors = new ErrorTracker({
  endpoint: process.env.ERROR_TRACKER_ENDPOINT!,
  dsn: process.env.ERROR_TRACKER_DSN,
  environment: process.env.NODE_ENV ?? "production",
  maxBreadcrumbs: 50,
});
```

3. **Set persistent context** (user, request info, etc.):
```typescript
errors.setContext("user", { id: userId, email: user.email });
errors.setContext("app", { version: "2.1.0", region: "us-east-1" });
```

4. **Add breadcrumbs** as events happen:
```typescript
errors.addBreadcrumb({ category: "navigation", message: "User opened /settings" });
errors.addBreadcrumb({ category: "api", message: "GET /api/profile", data: { status: 200 } });
```

5. **Capture errors**:
```typescript
try {
  await processPayment(order);
} catch (err) {
  const reportId = await errors.captureException(err as Error, { orderId: order.id });
  console.log(`Error reported: ${reportId}`);
}
```

6. **Python equivalent**:
```python
import requests, uuid, traceback, time

class ErrorTracker:
    def __init__(self, endpoint, dsn=None, environment="production", max_breadcrumbs=50):
        self.endpoint = endpoint
        self.dsn = dsn
        self.environment = environment
        self.max_breadcrumbs = max_breadcrumbs
        self.context = {}
        self.breadcrumbs = []

    def capture_exception(self, error, extra=None):
        report_id = str(uuid.uuid4())
        report = {
            "id": report_id,
            "level": "error",
            "message": str(error),
            "stack": traceback.format_exc(),
            "context": {**self.context, **({"extra": extra} if extra else {})},
            "breadcrumbs": self.breadcrumbs[:],
            "timestamp": time.time(),
            "environment": self.environment,
        }
        try:
            requests.post(self.endpoint, json=report, headers={"X-Error-Tracker-DSN": self.dsn or ""})
        except Exception:
            pass
        return report_id
```

## Environment Variables Required
| Variable | Description |
|---|---|
| `ERROR_TRACKER_ENDPOINT` | URL to POST error reports to |
| `ERROR_TRACKER_DSN` | Optional DSN for service identification |

## Constraints
- Reports are fire-and-forget — network failures are silently ignored to prevent recursive error loops.
- Breadcrumbs are capped at `maxBreadcrumbs`; oldest are evicted first.
- Context is cumulative — `setContext("user", { name })` merges with existing user context.
- Uses `fetch()` — Node.js < 18 requires a polyfill.
- The `installGlobalHandler()` method only works in Node.js; for browsers, use `window.addEventListener("error", ...)`.

## Composability
- Use with `@radzor/health-check` to capture dependency failure details.
- Pipe `onErrorCaptured` events into `@radzor/log-aggregator` for structured logging.
- Combine with `@radzor/event-tracker` to correlate errors with user actions.
