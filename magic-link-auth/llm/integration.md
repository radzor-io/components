# How to integrate @radzor/magic-link-auth

## Overview

Generates and verifies HMAC-SHA256-signed magic link tokens for passwordless email authentication. Token state is held in memory — suitable for single-instance Node.js servers. You are responsible for sending the generated URL to the user.

## Integration Steps

1. Install with `radzor add magic-link-auth`.
2. Instantiate `MagicLinkAuth` with a strong `secret`, your app's `baseUrl` (the verification endpoint), and optional `tokenTtl` (seconds, default 900) and `singleUse` (default `true`).
3. Call `generateLink(email)` to get a signed URL. Send the URL to the user via your email provider.
4. On the verification route, extract the `token` query parameter and call `verifyToken(token)`. Check `valid` before granting access.
5. To invalidate a token before its TTL expires, call `revokeToken(token)`.

```typescript
import { MagicLinkAuth } from "./components/magic-link-auth/src";

const auth = new MagicLinkAuth({
  secret: process.env.MAGIC_LINK_SECRET!,
  baseUrl: "https://myapp.com/auth/verify",
  tokenTtl: 600,
  singleUse: true,
});

// Generate and send link
const { url, expiresAt } = await auth.generateLink("user@example.com");
await sendEmail(user.email, `Sign in: ${url}`);

// Verify on callback route
const { email, valid } = await auth.verifyToken(req.query.token as string);
if (!valid) return res.status(401).send("Invalid or expired link");
// issue session for email...
```

## Constraints

- `generateLink()` only creates the URL — you must send it yourself. The component has no email-sending capability.
- Token store is in-memory. A process restart clears all pending tokens. Use an external store (Redis, database) for multi-instance deployments.
- Always use a cryptographically random `secret` of at least 32 bytes. Rotate it to invalidate all outstanding tokens.
- `singleUse: true` marks the token as used on first successful verification, preventing replay attacks.
- The signature uses constant-time comparison to prevent timing attacks.

## Composability

Pair with `@radzor/email-send` to dispatch the magic link. Combine with `@radzor/session-manager` to create a session after successful verification. For multi-instance deployments, replace the internal `Map` store with `@radzor/cache-store` backed by Redis.
