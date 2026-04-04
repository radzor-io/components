# How to integrate @radzor/background-job

## Overview
Persistent job queue backed by PostgreSQL (pg-boss) or Redis (BullMQ). Define workers once at startup, enqueue from anywhere.

## Integration Steps

1. **Setup and register workers (once at startup):**
```typescript
import { BackgroundJob } from "@radzor/background-job";
const jobs = new BackgroundJob({
  driver: "pg-boss",
  connection: process.env.DATABASE_URL!,
  concurrency: 5,
});

jobs.process("send-email", async (payload, jobId) => {
  await emailClient.send(payload.to, payload.subject, payload.body);
});

jobs.process("resize-image", async (payload) => {
  const buffer = await imageTransform.resize(payload.buffer, 800, 600);
  await storage.upload(payload.key, buffer);
});
```

2. **Enqueue from a request handler:**
```typescript
const jobId = await jobs.enqueue("send-email", {
  to: "user@example.com",
  subject: "Welcome",
  body: "<h1>Hello</h1>",
});
```

3. **Delayed and scheduled jobs:**
```typescript
// Run in 10 minutes
await jobs.enqueue("send-reminder", { userId }, { delay: 10 * 60 * 1000 });

// Run every day at 9am
await jobs.enqueue("daily-report", {}, { repeat: "0 9 * * *" });
```

4. **Check job status:**
```typescript
const result = await jobs.getJob(jobId);
console.log(result.status); // "active" | "completed" | "failed"
```
