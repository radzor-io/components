# @radzor/kv-store — Usage Examples

## Basic in-memory usage

```typescript
import { KvStore } from "@radzor/kv-store";

const store = new KvStore({ mode: "memory", defaultTtl: 60000 }); // 60s default TTL

await store.set("user:123", JSON.stringify({ name: "Alice", role: "admin" }));
const user = await store.get("user:123");
console.log(JSON.parse(user!)); // { name: "Alice", role: "admin" }
```

## TTL and expiration tracking

```typescript
const store = new KvStore({ mode: "memory" });

store.on("onExpired", ({ key, value }) => {
  console.log(`Key "${key}" expired. Last value: ${value}`);
});

// Set with 5-second TTL
await store.set("session:abc", "token-xyz", 5000);

// Still available
console.log(await store.has("session:abc")); // true

// After 5 seconds...
setTimeout(async () => {
  console.log(await store.get("session:abc")); // null
  // onExpired event fires
}, 6000);
```

## Namespace isolation

```typescript
const userStore = new KvStore({ mode: "memory", namespace: "users" });
const cacheStore = new KvStore({ mode: "memory", namespace: "cache" });

await userStore.set("123", JSON.stringify({ name: "Bob" }));
await cacheStore.set("123", "cached-value");

// Keys are isolated
console.log(await userStore.get("123")); // '{"name":"Bob"}'
console.log(await cacheStore.get("123")); // "cached-value"

// keys() returns unprefixed
console.log(await userStore.keys("*")); // ["123"]
```

## Pattern-based key lookup

```typescript
const store = new KvStore();

await store.set("user:1", "Alice");
await store.set("user:2", "Bob");
await store.set("session:a", "token-a");
await store.set("session:b", "token-b");

const userKeys = await store.keys("user:*");
console.log(userKeys); // ["user:1", "user:2"]

const allKeys = await store.keys("*");
console.log(allKeys); // ["user:1", "user:2", "session:a", "session:b"]
```

## Redis mode

```typescript
const store = new KvStore({
  mode: "redis",
  redisUrl: process.env.REDIS_URL!, // redis://localhost:6379/0
  namespace: "myapp",
  defaultTtl: 300000, // 5 minutes
});

await store.connect(); // establishes TCP connection

await store.set("counter", "42");
const val = await store.get("counter");
console.log(val); // "42"

// TTL is handled by Redis natively
await store.set("temp", "will-expire", 10000); // 10s TTL

// Clean up
store.destroy();
```

## Session store pattern

```typescript
const sessions = new KvStore({
  mode: "memory",
  namespace: "sessions",
  defaultTtl: 1800000, // 30 minutes
});

sessions.on("onExpired", ({ key }) => {
  console.log(`Session ${key} expired — user logged out`);
});

async function createSession(userId: string): Promise<string> {
  const sessionId = crypto.randomUUID();
  await sessions.set(sessionId, JSON.stringify({ userId, createdAt: Date.now() }));
  return sessionId;
}

async function getSession(sessionId: string): Promise<{ userId: string } | null> {
  const data = await sessions.get(sessionId);
  return data ? JSON.parse(data) : null;
}

async function destroySession(sessionId: string): Promise<void> {
  await sessions.delete(sessionId);
}
```

---

## Python Examples

### Basic usage

```python
from kv_store import KvStore, KvStoreConfig

store = KvStore(KvStoreConfig(mode="memory", default_ttl=60000))

store.set("user:123", '{"name": "Alice"}')
user = store.get("user:123")
print(user)  # '{"name": "Alice"}'
```

### TTL

```python
store.set("temp", "expires-soon", ttl=5000)
print(store.has("temp"))  # True
# After 5 seconds: False
```

### Pattern search

```python
store.set("order:1", "pending")
store.set("order:2", "shipped")
store.set("user:1", "Alice")

order_keys = store.keys("order:*")
print(order_keys)  # ["order:1", "order:2"]
```

### Expiration events

```python
store.on("onExpired", lambda e: print(f"Expired: {e['key']}"))
store.set("volatile", "data", ttl=3000)
```
