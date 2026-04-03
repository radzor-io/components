# queue-worker — Examples

## Basic job processing

### TypeScript

```typescript
import { QueueWorker } from "./components/queue-worker/src";

const queue = new QueueWorker<string>({ concurrency: 2 });

queue.process(async (url) => {
  const res = await fetch(url);
  console.log(`Fetched ${url}: ${res.status}`);
});

queue.on("onJobComplete", (job) => console.log(`Done: ${job.id}`));
queue.on("onJobFailed", (job) => console.error(`Failed: ${job.id} — ${job.error}`));

queue.start();
queue.addJob("https://example.com/api/1");
queue.addJob("https://example.com/api/2");
queue.addJob("https://example.com/api/3");
```

### Python

```python
from components.queue_worker.src import QueueWorker
from urllib.request import urlopen

queue = QueueWorker(concurrency=2)

def handler(url):
    resp = urlopen(url)
    print(f"Fetched {url}: {resp.status}")

queue.process(handler)
queue.on("onJobComplete", lambda job: print(f"Done: {job.id}"))
queue.on("onJobFailed", lambda job: print(f"Failed: {job.id} — {job.error}"))
queue.start()
queue.add_job("https://example.com/api/1")
queue.add_job("https://example.com/api/2")
```

## Retry behavior

### TypeScript

```typescript
const queue = new QueueWorker({
  maxRetries: 5,
  retryDelay: 2000, // 2 seconds between retries
});

let attempt = 0;
queue.process(async (data) => {
  attempt++;
  if (attempt < 3) throw new Error("Simulated failure");
  console.log("Success on attempt", attempt);
});

queue.start();
queue.addJob("test");
```

### Python

```python
queue = QueueWorker(max_retries=5, retry_delay=2.0)

attempt = 0
def handler(data):
    global attempt
    attempt += 1
    if attempt < 3:
        raise Exception("Simulated failure")
    print(f"Success on attempt {attempt}")

queue.process(handler)
queue.start()
queue.add_job("test")
```

## Dead letter queue inspection

### TypeScript

```typescript
queue.on("onJobFailed", (job) => {
  const deadLetters = queue.getDeadLetter();
  console.log(`${deadLetters.length} jobs in dead letter queue`);

  for (const j of deadLetters) {
    console.log(`  ${j.id}: ${j.error} (${j.attempts} attempts)`);
  }
});
```

### Python

```python
def on_failed(job):
    dead_letters = queue.get_dead_letter()
    print(f"{len(dead_letters)} jobs in dead letter queue")
    for j in dead_letters:
        print(f"  {j.id}: {j.error} ({j.attempts} attempts)")

queue.on("onJobFailed", on_failed)
```
