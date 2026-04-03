# cache-store — Integration Guide

## Overview

In-memory cache with TTL expiration, LRU eviction, and cache-aside pattern support. Zero external dependencies.

## Installation

```bash
radzor add cache-store
```

## Configuration

| Input        | Type   | Required | Description                                 |
| ------------ | ------ | -------- | ------------------------------------------- |
| `maxSize`    | number | no       | Maximum entries (default: 1000)             |
| `defaultTtl` | number | no       | Default TTL in ms/seconds (default: 0 = no expiry) |

## Quick Start

### TypeScript

```typescript
import { CacheStore } from "./components/cache-store/src";

const cache = new CacheStore({ maxSize: 100, defaultTtl: 60000 }); // 60s TTL

cache.set("user:1", { name: "Alice", age: 30 });
const user = cache.get("user:1");
```

### Python

```python
from components.cache_store.src import CacheStore

cache = CacheStore(max_size=100, default_ttl=60)  # 60s TTL

cache.set("user:1", {"name": "Alice", "age": 30})
user = cache.get("user:1")
```

## Actions

### get — Get value by key (returns undefined/None on miss)
### set — Set value with optional TTL override
### delete — Delete a key
### has — Check if key exists and is not expired
### clear — Clear all entries
### getOrSet / get_or_set — Get value or compute and cache it
### getOrSetAsync — Async version (TypeScript only)

## Eviction

- **TTL**: Entries expire after TTL. Lazy deletion on access.
- **LRU**: When cache is full, the least recently accessed entry is evicted.

## Requirements

- No external dependencies
