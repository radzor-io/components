# How to integrate @radzor/log-aggregator

## Overview
This component provides structured logging with a pluggable transport system. Logs are JSON-formatted entries with level, message, timestamp, and metadata. Built-in transports: console (stdout/stderr), HTTP (batched POST to a URL), and custom (user-defined function). Zero dependencies.

## Integration Steps

1. **Install**: Copy `src/index.ts` into your project or import from the package.

2. **Create a logger**:
```typescript
import { LogAggregator } from "@radzor/log-aggregator";

const logger = new LogAggregator({
  level: "info",
  defaultMeta: { service: "api-gateway", version: "1.2.0" },
  transports: [
    { type: "console" },
    { type: "http", url: "https://logs.example.com/ingest", headers: { "X-API-Key": "..." } },
  ],
});
```

3. **Write logs**:
```typescript
logger.info("Server started", { port: 3000 });
logger.warn("Slow query", { query: "SELECT ...", durationMs: 1200 });
logger.error("Payment failed", { orderId: "ord_123", error: err.message });
```

4. **Create child loggers** for sub-modules:
```typescript
const dbLogger = logger.child({ module: "database" });
dbLogger.info("Connection pool initialized", { poolSize: 10 });
// Inherits service/version meta + adds module: "database"
```

5. **Add custom transports at runtime**:
```typescript
logger.addTransport({
  name: "file",
  write(entry) {
    const fs = require("fs");
    fs.appendFileSync("/var/log/app.log", JSON.stringify(entry) + "\n");
  },
});
```

6. **Python equivalent**:
```python
import json, sys, time, requests

class LogAggregator:
    LEVELS = {"debug": 0, "info": 1, "warn": 2, "error": 3, "fatal": 4}

    def __init__(self, level="info", default_meta=None):
        self.min_level = self.LEVELS[level]
        self.default_meta = default_meta or {}
        self.transports = [self._console_transport]

    def info(self, message, **meta):
        self._log("info", message, meta)

    def error(self, message, **meta):
        self._log("error", message, meta)

    def _log(self, level, message, meta):
        if self.LEVELS[level] < self.min_level:
            return
        entry = {"level": level, "message": message, "meta": {**self.default_meta, **meta}}
        for transport in self.transports:
            transport(entry)

    def _console_transport(self, entry):
        print(json.dumps(entry), file=sys.stderr if entry["level"] in ("error", "fatal") else sys.stdout)
```

## Environment Variables Required
No environment variables required. HTTP transport URLs and headers are configured in code.

## Constraints
- Log entries below the configured level are silently discarded.
- The HTTP transport batches logs (10 per batch) and flushes every 5 seconds. Network failures are silently ignored.
- Transport errors (e.g. file write failures) are caught and swallowed to prevent log calls from crashing the app.
- The console transport outputs JSON to `console.info/warn/error` — pipe to a structured log ingester for production use.

## Composability
- Use as the logging backbone for `@radzor/health-check`, `@radzor/error-tracker`, and `@radzor/uptime-monitor`.
- Pipe `onLog` events into `@radzor/event-tracker` for log-based analytics.
