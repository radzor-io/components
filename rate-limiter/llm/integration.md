# How to integrate @radzor/rate-limiter

## Overview
In-memory rate limiter with two algorithms: token bucket (allows bursts) and sliding window (strict per-window limit). Zero dependencies, automatic memory cleanup, and built-in HTTP header generation.

## Integration Steps

### TypeScript

1. **Import and configure:**
```typescript
import { RateLimiter } from "@radzor/rate-limiter";

const limiter = new RateLimiter({
  algorithm: "sliding-window",
  maxRequests: 100,
  windowMs: 60_000,
});
```

2. **Use in an API route:**
```typescript
function handleRequest(req, res) {
  const clientIp = req.headers["x-forwarded-for"] ?? req.socket.remoteAddress;
  const result = limiter.consume(clientIp);

  const headers = limiter.getHeaders(result);
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }

  if (!result.allowed) {
    res.status(429).json({ error: "Too many requests", retryAfterMs: result.retryAfterMs });
    return;
  }

  res.json({ ok: true });
}
```

3. **Listen for events:**
```typescript
limiter.on("onBlocked", ({ key, retryAfterMs }) => {
  console.warn(`Rate limited: ${key}, retry in ${retryAfterMs}ms`);
});
```

4. **Cleanup when shutting down:**
```typescript
process.on("SIGTERM", () => {
  limiter.destroy();
});
```

### Python

1. **Import and configure:**
```python
from rate_limiter import RateLimiter, RateLimiterConfig

limiter = RateLimiter(RateLimiterConfig(
    algorithm="sliding-window",  # or "token-bucket"
    max_requests=100,
    window_ms=60_000,
))
```

2. **Use in a Flask/FastAPI route:**
```python
from flask import request, jsonify

@app.route("/api/data")
def handle_request():
    client_ip = request.remote_addr
    result = limiter.consume(client_ip)

    headers = limiter.get_headers(result)
    if not result.allowed:
        return jsonify(error="Too many requests"), 429, headers

    return jsonify(ok=True), 200, headers
```

3. **Listen for events:**
```python
limiter.on("onBlocked", lambda e: print(f"Rate limited: {e['key']}"))
```

4. **Cleanup when shutting down:**
```python
import atexit
atexit.register(limiter.destroy)
```

## Algorithm Choice

| Algorithm | Behavior | Best for |
|-----------|----------|----------|
| `token-bucket` | Allows bursts up to max, then refills gradually | APIs where short bursts are OK |
| `sliding-window` | Strictly counts requests in the moving window | APIs needing precise per-interval limits |

## Important Constraints
- **In-memory only** — rate limits reset when the process restarts
- For distributed systems (multiple instances), use Redis or a shared store
- Automatic cleanup runs every `2 × windowMs` to prevent memory leaks
- Call `destroy()` on shutdown to clear intervals
