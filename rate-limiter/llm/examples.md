# @radzor/rate-limiter — Usage Examples

## TypeScript

### Basic API Rate Limiting

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

### Express Middleware

```typescript
function rateLimitMiddleware(req, res, next) {
  const result = limiter.consume(req.ip);
  const headers = limiter.getHeaders(result);
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (!result.allowed) return res.status(429).json({ error: "Too many requests" });
  next();
}
app.use("/api", rateLimitMiddleware);
```

### Check Without Consuming

```typescript
const result = limiter.check("user-123");
console.log(`Remaining: ${result.remaining}`);
```

### Graceful Shutdown

```typescript
process.on("SIGTERM", () => {
  limiter.destroy();
});
```

## Python

### Basic API Rate Limiting (Flask)

```python
from rate_limiter import RateLimiter, RateLimiterConfig
from flask import Flask, request, jsonify

app = Flask(__name__)
limiter = RateLimiter(RateLimiterConfig(
    algorithm="sliding-window",
    max_requests=60,
    window_ms=60_000,
))

@app.route("/api/data")
def handler():
    result = limiter.consume(request.remote_addr)
    headers = limiter.get_headers(result)
    if not result.allowed:
        return jsonify(error="Rate limited"), 429, headers
    return jsonify(data="ok"), 200, headers
```

### FastAPI Middleware

```python
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI()

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    result = limiter.consume(request.client.host)
    if not result.allowed:
        headers = limiter.get_headers(result)
        return JSONResponse({"error": "Too many requests"}, status_code=429, headers=headers)
    response = await call_next(request)
    for k, v in limiter.get_headers(result).items():
        response.headers[k] = v
    return response
```

### Check Without Consuming

```python
result = limiter.check("user-123")
print(f"Remaining: {result.remaining}")
```

### Per-User Rate Limiting

```python
result = limiter.consume(current_user.id)
if not result.allowed:
    raise HTTPException(429, detail="Hourly limit exceeded")
```

### Cleanup

```python
import atexit
atexit.register(limiter.destroy)
```
