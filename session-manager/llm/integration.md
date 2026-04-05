# How to integrate @radzor/session-manager

## Overview
Secure session management with HMAC-SHA256 signed cookies using Node.js built-in `crypto`. Memory store is fully implemented. Redis and Postgres stores require `ioredis` or `pg` respectively. Zero mandatory dependencies.

## Integration Steps

1. **Import and configure:**
```typescript
import { SessionManager } from "@radzor/session-manager";

const sessions = new SessionManager({
  secret: process.env.SESSION_SECRET!,  // Required: min 32 chars
  store: "memory",                       // "memory" | "redis" | "postgres"
  ttl: 86400,                            // 24 hours
  cookieName: "sid",
  secure: process.env.NODE_ENV === "production",
});
```

2. **Create a session on login:**
```typescript
const { sessionId, cookie } = await sessions.create({ userId: user.id, role: user.role });
res.setHeader("Set-Cookie", cookie);
res.json({ ok: true });
```

3. **Read session on authenticated requests:**
```typescript
const sessionId = sessions.parseCookie(req.headers.cookie ?? "");
if (!sessionId) return res.status(401).json({ error: "Not authenticated" });

const data = await sessions.get(sessionId);
if (!data) return res.status(401).json({ error: "Session expired" });
```

4. **Update session data:**
```typescript
await sessions.set(sessionId, { lastActive: Date.now() });
```

5. **Destroy session on logout:**
```typescript
await sessions.destroy(sessionId);
res.setHeader("Set-Cookie", `sid=; Max-Age=0; Path=/; HttpOnly`);
```

6. **Use Redis store (production):**
```typescript
import Redis from "ioredis"; // npm install ioredis

const redis = new Redis(process.env.REDIS_URL);
const sessions = new SessionManager({
  store: "redis",
  connection: redis,
  secret: process.env.SESSION_SECRET!,
});
```

7. **Listen for events:**
```typescript
sessions.on("onCreated", ({ sessionId }) => console.log("Session created:", sessionId));
sessions.on("onExpired", ({ sessionId }) => console.log("Session expired:", sessionId));
sessions.on("onError", ({ code, message }) => console.error(`[${code}]: ${message}`));
```

## Constraints
- `secret` is required and must be kept out of source control. Use environment variables.
- Memory store loses all sessions on process restart. Use `store: "redis"` or `store: "postgres"` in production.
- `secure: false` only in local development (HTTP). Always use `secure: true` on HTTPS.
- Cookie signature uses HMAC-SHA256 with timing-safe comparison — never compare signatures with `===`.
- Postgres store requires the sessions table: `CREATE TABLE sessions (id TEXT PRIMARY KEY, data JSONB, expires_at TIMESTAMPTZ);`
