# @radzor/rate-limiter — Usage Examples

## Basic API Rate Limiting

```typescript
import { RateLimiter } from "@radzor/rate-limiter";

const limiter = new RateLimiter({
  algorithm: "sliding-window",
  maxRequests: 60,
  windowMs: 60_000,
});

function handler(req, res) {
  const key = req.headers["x-forwarded-for"] ?? req.socket.remoteAddress;
  const result = limiter.consume(key);

  const headers = limiter.getHeaders(result);
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);

  if (!result.allowed) {
    return res.status(429).json({ error: "Rate limited", retryAfterMs: result.retryAfterMs });
  }

  res.json({ data: "ok" });
}
```

## Express Middleware

```typescript
import { RateLimiter } from "@radzor/rate-limiter";

const limiter = new RateLimiter({
  algorithm: "token-bucket",
  maxRequests: 100,
  windowMs: 60_000,
});

function rateLimitMiddleware(req, res, next) {
  const key = req.ip;
  const result = limiter.consume(key);

  const headers = limiter.getHeaders(result);
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);

  if (!result.allowed) {
    return res.status(429).json({ error: "Too many requests" });
  }

  next();
}

app.use("/api", rateLimitMiddleware);
```

## Check Without Consuming

```typescript
const result = limiter.check("user-123");

if (result.allowed) {
  console.log(`Remaining: ${result.remaining}/${result.limit}`);
} else {
  console.log(`Blocked, retry in ${result.retryAfterMs}ms`);
}
```

## Per-User Rate Limiting

```typescript
const limiter = new RateLimiter({
  algorithm: "sliding-window",
  maxRequests: 10,
  windowMs: 3600_000, // 10 requests per hour per user
});

function handler(req, res) {
  const userId = req.auth.userId; // use user ID, not IP
  const result = limiter.consume(userId);

  if (!result.allowed) {
    return res.status(429).json({
      error: "Hourly limit exceeded",
      retryAfterMs: result.retryAfterMs,
    });
  }

  res.json({ data: "ok" });
}
```

## Reset a Key

```typescript
// After user upgrades their plan, reset their counter
limiter.reset("user-123");
```

## Logging Blocked Requests

```typescript
limiter.on("onBlocked", ({ key, retryAfterMs }) => {
  logger.warn(`Rate limited key=${key} retry_after_ms=${retryAfterMs}`);
});

limiter.on("onError", ({ error }) => {
  logger.error("Rate limiter error:", error);
});
```

## Graceful Shutdown

```typescript
process.on("SIGTERM", () => {
  limiter.destroy(); // clears cleanup interval
  server.close();
});
```
