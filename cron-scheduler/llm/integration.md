# How to integrate @radzor/cron-scheduler

## Overview
In-process cron scheduler for recurring tasks. Supports standard cron expressions, interval-based scheduling, and graceful shutdown.

## Integration Steps

### TypeScript

1. **Configure and schedule jobs**:
```typescript
import { CronScheduler } from "@radzor/cron-scheduler";

const scheduler = new CronScheduler({ timezone: "Europe/Paris" });

scheduler.schedule("cleanup", "0 3 * * *", async () => {
  await db.deleteExpiredSessions();
});

scheduler.schedule("heartbeat", "every 30s", () => {
  console.log("alive");
});

scheduler.start();
```

2. **Stop gracefully**:
```typescript
process.on("SIGTERM", () => scheduler.stop());
```

### Python

No external dependencies.

1. **Configure and schedule jobs**:
```python
from cron_scheduler import CronScheduler, CronSchedulerConfig

scheduler = CronScheduler(CronSchedulerConfig(timezone="Europe/Paris"))

scheduler.schedule("cleanup", "0 3 * * *", lambda: db.delete_expired_sessions())
scheduler.schedule("heartbeat", "every 30s", lambda: print("alive"))

scheduler.start()
```

2. **Stop gracefully**:
```python
import atexit
atexit.register(scheduler.stop)
```

## Cron Expression Format
```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12)
│ │ │ │ ┌───────────── day of week (0-6, Sunday=0)
│ │ │ │ │
* * * * *
```

Interval syntax: `every 30s`, `every 5m`, `every 1h`.

## Constraints
- In-process only — jobs do not persist across restarts.
- Cron check granularity is 1 second.
