# queue-worker — Integration Guide

## Overview

In-memory job queue with configurable concurrency, automatic retries, and dead-letter handling. No external dependencies — runs entirely in-process.

## Installation

```bash
radzor add queue-worker
```

## Configuration

| Input         | Type   | Required | Description                             |
| ------------- | ------ | -------- | --------------------------------------- |
| `concurrency` | number | no       | Max concurrent workers (default: 1)     |
| `maxRetries`  | number | no       | Max retry attempts per job (default: 3) |
| `retryDelay`  | number | no       | Delay between retries in ms (default: 1000) |

## Quick Start

### TypeScript

```typescript
import { QueueWorker } from "./components/queue-worker/src";

const queue = new QueueWorker<{ email: string }>({
  concurrency: 3,
  maxRetries: 2,
});

queue.process(async (data) => {
  console.log("Sending email to", data.email);
});

queue.start();
queue.addJob({ email: "user@example.com" });
```

### Python

```python
from components.queue_worker.src import QueueWorker

queue = QueueWorker(concurrency=3, max_retries=2)

def handler(data):
    print(f"Sending email to {data['email']}")

queue.process(handler)
queue.start()
queue.add_job({"email": "user@example.com"})
```

## Actions

### addJob / add_job

Add a job to the queue. Returns the Job object with a unique ID.

### process

Register the worker function that processes each job's data.

### start

Start processing queued jobs.

### stop

Stop processing (jobs already in-flight will finish).

## Accessors

- `getQueue()` / `get_queue()` — list of all jobs
- `getDeadLetter()` / `get_dead_letter()` — list of jobs that failed after all retries

## Requirements

- No external dependencies
- Python uses `threading` for concurrency
