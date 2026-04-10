# How to integrate @radzor/kv-store

## Overview
Key-value store with TTL support and namespace isolation. Operates in-memory by default (zero dependencies) or connects to Redis using a raw RESP protocol implementation (no npm packages needed). Supports expiration callbacks and glob-pattern key queries.

## Integration Steps

### TypeScript

1. **No external dependencies required.** In-memory mode uses no packages. Redis mode uses Node.js `net`.

2. **Create an instance (in-memory):**
```typescript
import { KvStore } from "@radzor/kv-store";

const store = new KvStore({
  mode: "memory",
  namespace: "myapp",
  defaultTtl: 60000, // 60 seconds
});
```

3. **Create an instance (Redis):**
```typescript
const store = new KvStore({
  mode: "redis",
  redisUrl: process.env.REDIS_URL!,
  namespace: "myapp",
});
await store.connect();
```

4. **Basic operations:**
```typescript
await store.set("user:123", JSON.stringify({ name: "Alice" }));
await store.set("session:abc", "token-xyz", 300000); // 5 min TTL

const user = await store.get("user:123");
const exists = await store.has("session:abc");
const deleted = await store.delete("user:123");
```

5. **Query keys:**
```typescript
const userKeys = await store.keys("user:*");
console.log(userKeys); // ["user:123", "user:456"]
```

6. **Listen for expirations:**
```typescript
store.on("onExpired", ({ key, value }) => {
  console.log(`Key ${key} expired with value: ${value}`);
});
```

7. **Clean up:**
```typescript
await store.clear(); // clear namespace
store.destroy();     // stop sweep timer / close Redis
```

### Python

```python
from kv_store import KvStore, KvStoreConfig
import os

store = KvStore(KvStoreConfig(
    mode="memory",
    namespace="myapp",
    default_ttl=60000,
))

store.set("user:123", '{"name": "Alice"}')
user = store.get("user:123")
keys = store.keys("user:*")
```

## Environment Variables Required

| Variable | Description |
|---|---|
| `REDIS_URL` | Redis connection URL (only for redis mode) |

## Constraints

- In-memory mode stores data in-process. Data is lost on restart. No dependencies.
- Redis mode uses raw RESP protocol over TCP — no `ioredis` or `redis` npm package needed.
- TTL is in **milliseconds**.
- Namespace prefixes are applied transparently — `keys()` returns unprefixed keys.
- `onExpired` events fire in-memory only (checked during access or periodic sweep every 5 seconds).
- Values are always strings — serialize objects with `JSON.stringify`.
- Call `destroy()` to clean up timers and connections.

## Composability

The KV store can serve as a shared state backend for other components. Connections will be configured in a future pass.
