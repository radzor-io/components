# How to integrate @radzor/event-tracker

## Overview
This component buffers user events (custom events, page views, identify calls) in memory and flushes them as JSON batches to a configurable HTTP endpoint. Zero dependencies — uses raw `fetch()`. Works in both browsers and Node.js.

## Integration Steps

1. **Install**: Copy `src/index.ts` into your project or import from the package.

2. **Create an instance**:
```typescript
import { EventTracker } from "@radzor/event-tracker";

const tracker = new EventTracker({
  endpoint: process.env.EVENT_TRACKER_ENDPOINT!,
  batchSize: 20,        // flush every 20 events
  flushIntervalMs: 5000, // or every 5 seconds
  headers: {
    Authorization: `Bearer ${process.env.TRACKING_TOKEN}`,
  },
});
```

3. **Identify a user** (optional, enriches all subsequent events):
```typescript
tracker.identify("user_123", { plan: "pro", company: "Acme" });
```

4. **Track events**:
```typescript
tracker.track("button_click", { buttonId: "cta-signup" });
tracker.pageView("/dashboard", "/home");
```

5. **Flush manually** (e.g. before page unload):
```typescript
await tracker.flush();
```

6. **Python equivalent**:
```python
import requests, time, threading, uuid

class EventTracker:
    def __init__(self, endpoint, batch_size=20, flush_interval=5.0, headers=None):
        self.endpoint = endpoint
        self.batch_size = batch_size
        self.buffer = []
        self.headers = headers or {}
        self.session_id = uuid.uuid4().hex[:16]
        self.user_id = None
        # Start flush timer
        self._timer = threading.Timer(flush_interval, self._auto_flush)
        self._timer.daemon = True
        self._timer.start()

    def track(self, event_name, properties=None):
        self.buffer.append({"type": "track", "eventName": event_name, "properties": properties, "timestamp": time.time()})
        if len(self.buffer) >= self.batch_size:
            self.flush()

    def flush(self):
        if not self.buffer:
            return
        batch, self.buffer = self.buffer[:], []
        resp = requests.post(self.endpoint, json=batch, headers=self.headers)
        return {"eventCount": len(batch), "success": resp.ok}
```

## Environment Variables Required
| Variable | Description |
|---|---|
| `EVENT_TRACKER_ENDPOINT` | URL to POST event batches to |

## Constraints
- Events are buffered in memory; a process crash before flush loses buffered events.
- The endpoint must accept a POST with a JSON array body.
- Uses `fetch()` — Node.js < 18 requires a polyfill (e.g. `undici`).
- Auto-flush timer is non-blocking (`unref()`) and won't keep the process alive.

## Composability
- Pipe `onFlush` results into `@radzor/log-aggregator` for observability.
- Use `@radzor/session-manager` to extract `userId` before calling `identify()`.
