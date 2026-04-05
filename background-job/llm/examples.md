# @radzor/background-job — Usage Examples

## 1. Basic Setup and Worker Registration

```typescript
import { BackgroundJob } from "@radzor/background-job";

const jobs = new BackgroundJob({
  driver: "pg-boss",
  connection: process.env.DATABASE_URL!,
  concurrency: 5,
  maxAttempts: 3,
  backoffMs: 1000,
});

// Register workers once at startup
jobs.process("send-email", async (payload, jobId) => {
  const { to, subject, body } = payload as { to: string; subject: string; body: string };
  await emailClient.send(to, subject, body);
  console.log(`Email sent for job ${jobId}`);
});

jobs.process("generate-report", async (payload) => {
  const { userId, format } = payload as { userId: string; format: string };
  const report = await reportService.generate(userId, format);
  await storage.upload(`reports/${userId}.${format}`, report);
});
```

## 2. Enqueuing Jobs from Request Handlers

```typescript
import { BackgroundJob } from "@radzor/background-job";

const jobs = new BackgroundJob({ connection: process.env.DATABASE_URL! });

// POST /api/users
async function createUser(req: Request) {
  const user = await db.users.create(await req.json());

  // Fire-and-forget: send welcome email in background
  const jobId = await jobs.enqueue("send-email", {
    to: user.email,
    subject: "Welcome!",
    body: `<h1>Hi ${user.name}</h1>`,
  });

  return Response.json({ user, emailJobId: jobId });
}
```

## 3. Delayed and Scheduled Jobs

```typescript
import { BackgroundJob } from "@radzor/background-job";

const jobs = new BackgroundJob({ connection: process.env.DATABASE_URL! });

// Send a trial expiry reminder in 13 days
await jobs.enqueue(
  "send-email",
  { to: user.email, subject: "Your trial expires tomorrow", body: "..." },
  { delay: 13 * 24 * 60 * 60 * 1000 }
);

// Nightly report every day at 2am UTC
await jobs.enqueue(
  "generate-report",
  { format: "pdf" },
  { repeat: "0 2 * * *", jobId: "nightly-report" }
);

// High-priority payment processing
await jobs.enqueue(
  "process-payment",
  { invoiceId: "inv_123", amount: 4900 },
  { priority: 10 }
);
```

## 4. Monitoring and Event Handling

```typescript
import { BackgroundJob } from "@radzor/background-job";

const jobs = new BackgroundJob({
  connection: process.env.DATABASE_URL!,
  maxAttempts: 3,
  backoffMs: 2000,
});

jobs.on("onJobCompleted", ({ jobId, queue, durationMs }) => {
  metrics.histogram("job.duration", durationMs, { queue });
  console.log(`[${queue}] Job ${jobId} completed in ${durationMs}ms`);
});

jobs.on("onJobFailed", ({ jobId, queue, error, attempt }) => {
  metrics.increment("job.failed", { queue });
  console.error(`[${queue}] Job ${jobId} failed after ${attempt} attempts: ${error}`);
  alerting.notify(`Job failure on ${queue}: ${error}`);
});

jobs.on("onJobRetry", ({ jobId, attempt, nextDelayMs }) => {
  console.warn(`Job ${jobId} retry #${attempt}, next attempt in ${nextDelayMs}ms`);
});
```

## 5. Checking Job Status and Cancelling

```typescript
import { BackgroundJob } from "@radzor/background-job";

const jobs = new BackgroundJob({ connection: process.env.DATABASE_URL! });

// Enqueue and track
const jobId = await jobs.enqueue("export-data", { userId: "user_42", format: "csv" });

// Poll status (e.g. from a status endpoint)
const result = await jobs.getJob(jobId);
if (result) {
  console.log(result.status); // "active" | "completed" | "failed" | "created"
}

// Cancel a delayed job before it runs
const cancelled = await jobs.cancel(jobId);
console.log(cancelled ? "Cancelled" : "Could not cancel (already active)");

// Queue statistics
const stats = await jobs.getStats("export-data");
console.log(`Waiting: ${stats.waiting}, Active: ${stats.active}, Failed: ${stats.failed}`);
```
