# How to integrate @radzor/oauth-token-refresh

## Overview
Automatic OAuth token refresh. Call getToken() anywhere — it refreshes transparently when needed.

## Integration Steps

1. **Setup:**
```typescript
import { OAuthTokenRefresh } from "@radzor/oauth-token-refresh";
const tokenManager = new OAuthTokenRefresh({
  provider: "google",
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  refreshBuffer: 300, // refresh 5 min before expiry
});
```

2. **Store tokens after initial OAuth flow:**
```typescript
// After user completes OAuth (e.g. via @radzor/auth-oauth)
await tokenManager.store(userId, {
  accessToken: tokens.access_token,
  refreshToken: tokens.refresh_token,
  expiresAt: Date.now() + tokens.expires_in * 1000,
});
```

3. **Use getToken() instead of storing accessToken yourself:**
```typescript
// Always call getToken() — it auto-refreshes if needed
const accessToken = await tokenManager.getToken(userId);
const profile = await fetch("https://www.googleapis.com/oauth2/v1/userinfo", {
  headers: { Authorization: `Bearer ${accessToken}` },
});
```

4. **Handle refresh token expiry:**
```typescript
tokenManager.on("onExpired", ({ provider }) => {
  // Refresh token expired — user must re-authorize
  await db.updateUser(userId, { requiresReauth: true });
});
```
