# @radzor/session-manager — Usage Examples

## Login / Logout Flow (Express)

```typescript
import express from "express";
import { SessionManager } from "@radzor/session-manager";

const app = express();
app.use(express.json());

const sessions = new SessionManager({
  secret: process.env.SESSION_SECRET!,
  store: "memory",
  ttl: 3600,
  secure: process.env.NODE_ENV === "production",
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await authenticateUser(email, password); // your auth logic
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const { cookie } = await sessions.create({ userId: user.id, email: user.email });
  res.setHeader("Set-Cookie", cookie);
  res.json({ ok: true });
});

app.post("/logout", async (req, res) => {
  const sessionId = sessions.parseCookie(req.headers.cookie ?? "");
  if (sessionId) await sessions.destroy(sessionId);
  res.setHeader("Set-Cookie", "sid=; Max-Age=0; Path=/; HttpOnly");
  res.json({ ok: true });
});
```

## Authentication Middleware

```typescript
async function requireAuth(req: any, res: any, next: any) {
  const sessionId = sessions.parseCookie(req.headers.cookie ?? "");
  if (!sessionId) return res.status(401).json({ error: "Not authenticated" });

  const data = await sessions.get(sessionId);
  if (!data) return res.status(401).json({ error: "Session expired" });

  req.session = data;
  req.sessionId = sessionId;
  next();
}

app.get("/api/profile", requireAuth, async (req: any, res: any) => {
  res.json({ userId: req.session.userId });
});
```

## Updating Session Data

```typescript
app.post("/api/preferences", requireAuth, async (req: any, res: any) => {
  const { theme, language } = req.body;
  await sessions.set(req.sessionId, { theme, language });
  res.json({ ok: true });
});
```

## Redis Store for Multi-Instance Deployment

```typescript
import Redis from "ioredis";
import { SessionManager } from "@radzor/session-manager";

const redis = new Redis(process.env.REDIS_URL!);

const sessions = new SessionManager({
  store: "redis",
  connection: redis,
  secret: process.env.SESSION_SECRET!,
  ttl: 86400,
  cookieName: "sid",
  secure: true,
});

// Sessions are now shared across all server instances
```

## Session Event Monitoring

```typescript
const sessions = new SessionManager({ secret: process.env.SESSION_SECRET!, store: "memory" });

sessions.on("onCreated", ({ sessionId }) => {
  metrics.increment("sessions.created");
  console.log("New session:", sessionId.slice(0, 8) + "...");
});

sessions.on("onExpired", ({ sessionId }) => {
  metrics.increment("sessions.expired");
});

sessions.on("onDestroyed", ({ sessionId }) => {
  metrics.increment("sessions.destroyed");
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  await sessions.close();
});
```
