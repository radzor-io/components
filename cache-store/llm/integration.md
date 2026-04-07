# How to integrate @radzor/cache-store

## Overview
In-memory cache with TTL, LRU eviction, and namespace support. No external dependencies.

## Integration Steps

### TypeScript

1. **No external dependencies required.** This component uses native APIs only.

2. **Create an instance:**
```typescript
import { CacheStore } from "@radzor/cache-store";

const cacheStore = new CacheStore({

});
```

3. **Use the component:**
```typescript
cacheStore.get("example-key");
cacheStore.set("example-key", /* value */);
cacheStore.delete("example-key");
```

### Python

```python
from cache_store import CacheStore, CacheStoreConfig
import os

cacheStore = CacheStore(CacheStoreConfig(

))
```

## Events

- **onHit** — Fired on cache hit. Payload: `key: string`
- **onMiss** — Fired on cache miss. Payload: `key: string`
- **onEvicted** — Fired when an entry is evicted (TTL expired or LRU). Payload: `key: string`, `reason: string`
- **onError** — Fired on error. Payload: `code: string`, `message: string`
