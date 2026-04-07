# How to integrate @radzor/api-key-auth

## Overview
API key authentication middleware. Generate, validate, hash, and revoke API keys.

## Integration Steps

### TypeScript

1. **No external dependencies required.** This component uses native APIs only.

2. **Create an instance:**
```typescript
import { APIKeyAuth } from "@radzor/api-key-auth";

const apiKeyAuth = new APIKeyAuth({

});
```

3. **Use the component:**
```typescript
const result = await apiKeyAuth.generateKey();
const result = await apiKeyAuth.validateKey("example-key", "example-storedHash");
apiKeyAuth.hashKey("example-key");
```

### Python

```python
from api_key_auth import APIKeyAuth, APIKeyAuthConfig
import os

apiKeyAuth = APIKeyAuth(APIKeyAuthConfig(

))
```

## Events

- **onValidated** — Fired when an API key is successfully validated. Payload: `keyId: string`, `prefix: string`
- **onRevoked** — Fired when an API key is revoked. Payload: `keyId: string`
- **onError** — Fired on auth error. Payload: `code: string`, `message: string`
