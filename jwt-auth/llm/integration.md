# How to integrate @radzor/jwt-auth

## Overview
Create and verify JWT tokens using HMAC-SHA algorithms (HS256/384/512). Sign tokens with custom claims and expiration, verify signatures with timing-safe comparison, decode without verification for inspection, and refresh expiring tokens. No external dependencies — uses Node.js built-in `crypto` module.

## Integration Steps

### TypeScript

1. **Import and configure**:
```typescript
import { JwtAuth } from "@radzor/jwt-auth";

const jwt = new JwtAuth({
  secret: process.env.JWT_SECRET!,
  algorithm: "HS256",
  issuer: "myapp.com",
  audience: "myapp-users",
  expiresIn: 3600, // 1 hour
});
```

2. **Sign a token**:
```typescript
const token = jwt.sign({
  sub: "user_123",
  role: "admin",
  permissions: ["read", "write"],
});
```

3. **Verify a token** (e.g. middleware):
```typescript
try {
  const payload = jwt.verify(token);
  console.log(payload.sub, payload.role);
} catch (err) {
  console.error("Invalid token:", err.message);
}
```

4. **Decode without verification** (inspect claims):
```typescript
const claims = jwt.decode(token);
console.log("Expires:", new Date(claims.exp * 1000));
```

5. **Refresh an expiring token**:
```typescript
const newToken = jwt.refresh(oldToken, 7200); // 2 hours
```

6. **Listen for events**:
```typescript
jwt.on("onExpired", ({ sub, expiredAt }) => {
  console.log(`Token for ${sub} expired at ${new Date(expiredAt * 1000)}`);
});
```

### Python

1. **Configure**:
```python
import os
from jwt_auth import JwtAuth

jwt = JwtAuth(
    secret=os.environ["JWT_SECRET"],
    algorithm="HS256",
    issuer="myapp.com",
    expires_in=3600,
)
```

2. **Sign and verify**:
```python
token = jwt.sign({"sub": "user_123", "role": "admin"})
payload = jwt.verify(token)
print(payload["sub"])
```

3. **Refresh**:
```python
new_token = jwt.refresh(old_token, expires_in=7200)
```

## Environment Variables Required
- `JWT_SECRET` — HMAC secret key (minimum 32 characters recommended).

## Constraints
- No external dependencies — uses Node.js built-in `crypto` module.
- Only HMAC algorithms are supported (HS256, HS384, HS512) — not RSA or ECDSA.
- Secret must be kept server-side and never exposed to the client.
- Use `verify()` for security-critical checks — `decode()` does NOT verify the signature.
- Tokens include `jti` (unique ID), `iat` (issued at), and `exp` (expiration) automatically.
- Secret must be at least 16 characters; 32+ recommended for production.

## Composability
- Signed tokens can be verified in `@radzor/api-key-auth` middleware.
- Token payloads can contain role/permission claims for `@radzor/feature-flag` gating.
