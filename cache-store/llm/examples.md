# cache-store — Examples

## Basic get/set

### TypeScript

```typescript
import { CacheStore } from "./components/cache-store/src";

const cache = new CacheStore();
cache.set("greeting", "Hello World");
console.log(cache.get("greeting")); // "Hello World"
```

### Python

```python
from components.cache_store.src import CacheStore

cache = CacheStore()
cache.set("greeting", "Hello World")
print(cache.get("greeting"))  # "Hello World"
```

## TTL expiration

### TypeScript

```typescript
const cache = new CacheStore();
cache.set("temp", "data", 5000); // expires in 5 seconds
console.log(cache.get("temp")); // "data"
// After 5 seconds...
console.log(cache.get("temp")); // undefined
```

### Python

```python
cache = CacheStore()
cache.set("temp", "data", ttl=5)  # expires in 5 seconds
print(cache.get("temp"))  # "data"
# After 5 seconds...
print(cache.get("temp"))  # None
```

## Cache-aside pattern

### TypeScript

```typescript
const user = cache.getOrSet("user:42", () => {
  return db.query("SELECT * FROM users WHERE id = 42");
}, 30000);
```

### Python

```python
user = cache.get_or_set("user:42", lambda: db.query("SELECT * FROM users WHERE id = 42"), ttl=30)
```

## Async cache-aside (TypeScript)

```typescript
const data = await cache.getOrSetAsync("api:data", async () => {
  const res = await fetch("https://api.example.com/data");
  return res.json();
}, 60000);
```

## LRU eviction

### TypeScript

```typescript
const cache = new CacheStore({ maxSize: 3 });
cache.set("a", 1);
cache.set("b", 2);
cache.set("c", 3);
cache.get("a"); // access "a" to keep it fresh
cache.set("d", 4); // evicts "b" (least recently used)
```

## Cache stats

### TypeScript

```typescript
const stats = cache.getStats();
console.log(`Size: ${stats.size}, Hits: ${stats.hits}, Misses: ${stats.misses}`);
```

### Python

```python
stats = cache.get_stats()
print(f"Size: {stats.size}, Hits: {stats.hits}, Misses: {stats.misses}")
```

## Event listeners

### TypeScript

```typescript
cache.on("onHit", ({ key }) => console.log("HIT:", key));
cache.on("onMiss", ({ key }) => console.log("MISS:", key));
cache.on("onEvicted", ({ key, reason }) => console.log("EVICTED:", key, reason));
```

### Python

```python
cache.on("onHit", lambda e: print("HIT:", e["key"]))
cache.on("onMiss", lambda e: print("MISS:", e["key"]))
cache.on("onEvicted", lambda e: print("EVICTED:", e["key"], e["reason"]))
```
