# How to integrate @radzor/two-factor-auth

## Overview
TOTP-based two-factor authentication. Generate secrets, create QR URIs, and verify tokens (RFC 6238).

## Integration Steps

### TypeScript

1. **No external dependencies required.** This component uses native APIs only.

2. **Create an instance:**
```typescript
import { TwoFactorAuth } from "@radzor/two-factor-auth";

const twoFactorAuth = new TwoFactorAuth({
  issuer: "your-issuer",
});
```

3. **Use the component:**
```typescript
twoFactorAuth.generateSecret();
twoFactorAuth.generateQrUri("example-secret", "example-accountName");
twoFactorAuth.verifyToken("example-secret", "example-token");
```

### Python

```python
from two_factor_auth import TwoFactorAuth, TwoFactorAuthConfig
import os

twoFactorAuth = TwoFactorAuth(TwoFactorAuthConfig(
    issuer="your-issuer",
))
```

## Events

- **onVerified** — Fired when a TOTP token is verified. Payload: `valid: boolean`, `accountName: string`
- **onError** — Fired on verification error. Payload: `code: string`, `message: string`
