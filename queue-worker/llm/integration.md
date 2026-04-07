# How to integrate @radzor/queue-worker

## Overview
In-memory job queue with workers, retries, and dead-letter handling. No external dependencies.

## Integration Steps

### TypeScript

1. **No external dependencies required.** This component uses native APIs only.

2. **Create an instance:**
```typescript
import { QueueWorker } from "@radzor/queue-worker";

const queueWorker = new QueueWorker({

});
```

3. **Use the component:**
```typescript
queueWorker.addJob("example-name", /* payload */);
queueWorker.process("example-name", /* handler */);
queueWorker.start();
```

### Python

```python
from queue_worker import QueueWorker, QueueWorkerConfig
import os

queueWorker = QueueWorker(QueueWorkerConfig(

))
```

## Events

- **onJobComplete** — Fired when a job completes successfully. Payload: `jobId: string`, `name: string`, `durationMs: number`
- **onJobFailed** — Fired when a job fails after all retries. Payload: `jobId: string`, `name: string`, `error: string`, `attempts: number`
- **onError** — Fired on queue error. Payload: `code: string`, `message: string`
