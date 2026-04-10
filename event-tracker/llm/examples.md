# @radzor/event-tracker — Usage Examples

## Basic event tracking
```typescript
import { EventTracker } from "@radzor/event-tracker";

const tracker = new EventTracker({
  endpoint: "https://analytics.example.com/events",
});

tracker.track("signup", { method: "google" });
tracker.track("purchase", { amount: 29.99, currency: "USD" });
```

## Identify and enrich events
```typescript
const tracker = new EventTracker({
  endpoint: "https://analytics.example.com/events",
  batchSize: 10,
});

// All subsequent events carry these traits
tracker.identify("user_42", {
  email: "alice@example.com",
  plan: "enterprise",
});

tracker.track("feature_used", { feature: "export" });
// The flushed event includes plan: "enterprise" in properties
```

## Page view tracking in an SPA
```typescript
const tracker = new EventTracker({
  endpoint: "/api/analytics",
  flushIntervalMs: 3000,
});

// On route change (React Router, Next.js, etc.)
function onRouteChange(url: string, prevUrl: string) {
  tracker.pageView(url, prevUrl);
}

// Flush before the tab closes
window.addEventListener("beforeunload", () => {
  tracker.flush();
});
```

## Listening for flush results
```typescript
const tracker = new EventTracker({
  endpoint: "https://analytics.example.com/events",
});

tracker.on("onFlush", ({ eventCount, success }) => {
  if (!success) {
    console.error(`Failed to flush ${eventCount} events`);
  }
});

tracker.on("onEventTracked", ({ eventName, bufferSize }) => {
  console.log(`Tracked "${eventName}", buffer: ${bufferSize}`);
});
```

## Express middleware for server-side tracking
```typescript
import express from "express";
import { EventTracker } from "@radzor/event-tracker";

const app = express();
const tracker = new EventTracker({
  endpoint: process.env.EVENT_TRACKER_ENDPOINT!,
  headers: { "X-API-Key": process.env.TRACKING_API_KEY! },
});

app.use((req, res, next) => {
  tracker.track("api_request", {
    method: req.method,
    path: req.path,
    userAgent: req.headers["user-agent"],
  });
  next();
});

// Flush on graceful shutdown
process.on("SIGTERM", async () => {
  await tracker.flush();
  tracker.destroy();
  process.exit(0);
});
```

## Manual flush with result handling
```typescript
const tracker = new EventTracker({
  endpoint: "https://analytics.example.com/events",
  batchSize: 100, // large batch — flush manually
});

for (const action of userActions) {
  tracker.track("action", action);
}

const result = await tracker.flush();
console.log(`Flushed ${result.eventCount} events, success: ${result.success}`);
if (result.error) {
  console.error(`Flush error: ${result.error}`);
}
```

---

## Python Examples

### Basic tracking
```python
from event_tracker import EventTracker

tracker = EventTracker(
    endpoint="https://analytics.example.com/events",
    batch_size=20,
)

tracker.track("signup", {"method": "email"})
tracker.track("purchase", {"amount": 49.99})
tracker.flush()
```

### Flask middleware
```python
from flask import Flask, request
from event_tracker import EventTracker

app = Flask(__name__)
tracker = EventTracker(endpoint="https://analytics.example.com/events")

@app.before_request
def track_request():
    tracker.track("api_request", {
        "method": request.method,
        "path": request.path,
    })

@app.teardown_appcontext
def flush_on_teardown(exc):
    tracker.flush()
```
