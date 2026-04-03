# @radzor/auth-oauth — Usage Examples

## Basic Google login
```typescript
import { AuthOAuth } from "@radzor/auth-oauth";

const auth = new AuthOAuth({
  providers: ["google"],
  redirectUrl: "https://myapp.com/auth/callback",
  jwtSecret: process.env.JWT_SECRET!,
  clientCredentials: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
});

// Redirect to Google
const url = await auth.login("google");
res.redirect(url);
```

## Handle OAuth callback (Express)
```typescript
app.get("/auth/callback", async (req, res) => {
  const { code, state } = req.query;
  const provider = state.split(":")[0]; // "google", "github", etc.

  const session = await auth.handleCallback(provider, code);
  const user = auth.getUser();
  const jwt = await auth.createSessionToken();

  res.cookie("session", jwt, { httpOnly: true, secure: true, sameSite: "lax" });
  res.redirect("/dashboard");
});
```

## Multi-provider login page
```typescript
const auth = new AuthOAuth({
  providers: ["google", "github", "discord"],
  redirectUrl: "https://myapp.com/auth/callback",
  jwtSecret: process.env.JWT_SECRET!,
  clientCredentials: {
    google: { clientId: "...", clientSecret: "..." },
    github: { clientId: "...", clientSecret: "..." },
    discord: { clientId: "...", clientSecret: "..." },
  },
});

// Generate URLs for each provider
const googleUrl = await auth.login("google");
const githubUrl = await auth.login("github");
const discordUrl = await auth.login("discord");
```

## Verify session middleware
```typescript
async function requireAuth(req, res, next) {
  const token = req.cookies.session;
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  try {
    const payload = await auth.verifySessionToken(token);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid session" });
  }
}
```

## Event listeners
```typescript
auth.on("onLogin", ({ userId, provider }) => {
  console.log(`User ${userId} logged in via ${provider}`);
  analytics.track("login", { provider });
});

auth.on("onError", ({ code, message }) => {
  console.error(`Auth error [${code}]: ${message}`);
  errorTracker.capture(new Error(message));
});
```
