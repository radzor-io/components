# @radzor/oauth-token-refresh — Usage Examples

## 1. Google OAuth — Store Tokens After Initial Login

```typescript
import { OAuthTokenRefresh } from "@radzor/oauth-token-refresh";

const tokenManager = new OAuthTokenRefresh({
  provider: "google",
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  refreshBuffer: 300, // refresh 5 minutes before expiry
});

// After the user completes the OAuth flow (e.g. via NextAuth callback)
await tokenManager.store(userId, {
  accessToken: oauthResult.access_token,
  refreshToken: oauthResult.refresh_token,
  expiresAt: Date.now() + oauthResult.expires_in * 1000,
  scope: oauthResult.scope,
});

// From now on, always call getToken() — never store the access token yourself
const accessToken = await tokenManager.getToken(userId);
```

## 2. Transparent Auto-Refresh on Every API Call

```typescript
import { OAuthTokenRefresh } from "@radzor/oauth-token-refresh";

const tokenManager = new OAuthTokenRefresh({
  provider: "google",
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
});

tokenManager.on("onRefreshed", ({ expiresAt, scope }) => {
  console.log(`Token refreshed, expires at ${new Date(expiresAt).toISOString()}`);
});

// In a Google Calendar API call
async function listCalendarEvents(userId: string) {
  // getToken() auto-refreshes if within refreshBuffer seconds of expiry
  const accessToken = await tokenManager.getToken(userId);

  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return response.json();
}
```

## 3. Handle Expired Refresh Tokens (Re-auth Required)

```typescript
import { OAuthTokenRefresh } from "@radzor/oauth-token-refresh";

const tokenManager = new OAuthTokenRefresh({
  provider: "discord",
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
});

tokenManager.on("onExpired", async ({ provider }) => {
  console.warn(`[${provider}] Refresh token expired — user must re-authorize`);
  // Mark the user as needing re-auth in the database
  await db.users.update({ id: userId }, { requiresReauth: true });
});

tokenManager.on("onError", ({ code, message, provider }) => {
  console.error(`[${provider}] Token error ${code}: ${message}`);
});

try {
  const token = await tokenManager.getToken(userId);
  return await discordApi.getGuilds(token);
} catch (err) {
  return Response.json({ error: "Re-authorization required" }, { status: 401 });
}
```

## 4. Check Expiry and Force Refresh

```typescript
import { OAuthTokenRefresh } from "@radzor/oauth-token-refresh";

const tokenManager = new OAuthTokenRefresh({
  provider: "stripe",
  clientId: process.env.STRIPE_CLIENT_ID!,
  clientSecret: process.env.STRIPE_CLIENT_SECRET!,
  refreshBuffer: 600, // refresh 10 minutes early
});

// Check before making a batch of API calls
const expired = await tokenManager.isExpired(userId);
if (expired) {
  const storedTokens = await db.oauthTokens.findByUserId(userId);
  // Force refresh using the stored refresh token
  const meta = await tokenManager.refresh(storedTokens.refreshToken);
  await tokenManager.store(userId, {
    accessToken: meta.accessToken,
    refreshToken: storedTokens.refreshToken,
    expiresAt: meta.expiresAt,
  });
}
```

## 5. Revoke Tokens on User Logout

```typescript
import { OAuthTokenRefresh } from "@radzor/oauth-token-refresh";

const googleTokens = new OAuthTokenRefresh({
  provider: "google",
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
});

const discordTokens = new OAuthTokenRefresh({
  provider: "discord",
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
});

async function handleLogout(userId: string) {
  // Revoke tokens at the provider and remove from in-memory store
  await Promise.all([
    googleTokens.revoke(userId),
    discordTokens.revoke(userId),
  ]);

  // Also remove from persistent storage
  await db.oauthTokens.deleteByUserId(userId);

  return Response.json({ success: true });
}
```
