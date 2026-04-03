# @radzor/cron-scheduler — Usage Examples

## TypeScript

### Database cleanup every night
```typescript
import { CronScheduler } from "@radzor/cron-scheduler";

const scheduler = new CronScheduler();

scheduler.schedule("db-cleanup", "0 2 * * *", async () => {
  const deleted = await db.query("DELETE FROM sessions WHERE expires_at < NOW()");
  console.log(`Cleaned ${deleted.rowCount} expired sessions`);
});

scheduler.start();
```

### Health check every 30 seconds
```typescript
scheduler.schedule("health", "every 30s", async () => {
  const res = await fetch("https://api.myapp.com/health");
  if (!res.ok) alertTeam("API health check failed");
});
```

### Weekly report
```typescript
scheduler.schedule("weekly-report", "0 9 * * 1", async () => {
  const report = await generateWeeklyReport();
  await emailSend.send({ to: "team@company.com", subject: "Weekly Report", html: report });
});
```

### Event monitoring
```typescript
scheduler.on("onJobError", ({ jobId, error }) => {
  console.error(`Job ${jobId} failed: ${error}`);
  sentry.captureException(new Error(error));
});

scheduler.on("onJobComplete", ({ jobId, duration }) => {
  metrics.histogram("cron.duration", duration, { job: jobId });
});
```

## Python

### Database cleanup every night
```python
from cron_scheduler import CronScheduler

scheduler = CronScheduler()

def cleanup():
    cursor.execute("DELETE FROM sessions WHERE expires_at < NOW()")
    print(f"Cleaned {cursor.rowcount} expired sessions")

scheduler.schedule("db-cleanup", "0 2 * * *", cleanup)
scheduler.start()
```

### Periodic API polling
```python
import urllib.request, json

def check_api():
    with urllib.request.urlopen("https://api.myapp.com/health") as r:
        if r.status != 200:
            print("API is down!")

scheduler.schedule("health", "every 30s", check_api)
```

### Multiple jobs
```python
scheduler.schedule("hourly-sync", "0 * * * *", sync_data)
scheduler.schedule("daily-backup", "0 4 * * *", backup_database)
scheduler.schedule("heartbeat", "every 10s", lambda: print("tick"))

scheduler.start()

import atexit
atexit.register(scheduler.stop)
```
