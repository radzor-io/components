# How to integrate @radzor/rate-limiter

## Overview
In-memory rate limiter with two algorithms: token bucket (allows bursts) and sliding window (strict per-window limit). Zero dependencies, automatic memory cleanup, and built-in HTTP header generation.

## Integration Steps

1. **Import and configure:**
```typescript
import { RateLimiter } from "@radzor/rate-limiter";

const limiter = new RateLimiter({
  algorithm: "sliding-window", // or "token-bucket"
  maxRequests: 100,            // 100 requests
  windowMs: 60_000,            // per minute
});
```

2. **Use in an API route:**
```typescript
function handleRequest(req, res) {
  const clientIp = req.headers["x-forwarded-for"] ?? req.socket.remoteAddress;
  const result = limiter.consume(clientIp);

  // Set standard rate limit headers
  const headers = limiter.getHeaders(result);
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }

  if (!result.allowed) {
    res.status(429).json({ error: "Too many requests", retryAfterMs: result.retryAfterMs });
    return;
  }

  // Handle the request normally
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
