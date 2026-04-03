# api-key-auth — Examples

## Generate and validate a key

### TypeScript

```typescript
import { ApiKeyAuth } from "./components/api-key-auth/src";

const auth = new ApiKeyAuth({ prefix: "myapp_" });

const apiKey = auth.generateKey({ plan: "pro", userId: "u-42" });
console.log("API Key:", apiKey.key);      // myapp_a1b2c3...
console.log("Key Hash:", apiKey.hash);    // sha256 hash

const result = auth.validateKey(apiKey.key);
if (result.valid) {
  console.log("Authenticated! Metadata:", result.metadata);
}
```

### Python

```python
from components.api_key_auth.src import ApiKeyAuth

auth = ApiKeyAuth(prefix="myapp_")

api_key = auth.generate_key({"plan": "pro", "userId": "u-42"})
print("API Key:", api_key.key)
print("Key Hash:", api_key.hash)

result = auth.validate_key(api_key.key)
if result.valid:
    print("Authenticated! Metadata:", result.metadata)
```

## Validate from HTTP request headers

### TypeScript

```typescript
// Express-style middleware
function authMiddleware(req, res, next) {
  const result = auth.validateRequest(req.headers);
  if (!result.valid) {
    return res.status(401).json({ error: "Invalid API key" });
  }
  req.apiKeyMetadata = result.metadata;
  next();
}
```

### Python

```python
# Flask-style middleware
def auth_middleware():
    from flask import request, jsonify
    result = auth.validate_request(dict(request.headers))
    if not result.valid:
        return jsonify({"error": "Invalid API key"}), 401
```

## Revoke a key

### TypeScript

```typescript
auth.revokeKey(apiKey.key);
const result = auth.validateKey(apiKey.key);
console.log(result.valid); // false
```

### Python

```python
auth.revoke_key(api_key.key)
result = auth.validate_key(api_key.key)
print(result.valid)  # False
```

## Hash a key for database storage

### TypeScript

```typescript
const hash = auth.hashKey("myapp_abc123...");
// Store hash in database — never store raw keys
```

### Python

```python
key_hash = auth.hash_key("myapp_abc123...")
# Store key_hash in database
```

## Event listeners

### TypeScript

```typescript
auth.on("onValidated", (result) => {
  console.log(result.valid ? "OK" : "DENIED", result.keyHash);
});

auth.on("onRevoked", ({ keyHash }) => {
  console.log("Revoked:", keyHash);
});
```

### Python

```python
auth.on("onValidated", lambda r: print("OK" if r.valid else "DENIED", r.key_hash))
auth.on("onRevoked", lambda r: print("Revoked:", r["key_hash"]))
```
