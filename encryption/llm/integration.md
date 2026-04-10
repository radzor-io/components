# How to integrate @radzor/encryption

## Overview
Encrypt and decrypt data with AES-256-GCM authenticated encryption. Generate cryptographic keys, compute secure hashes (SHA-256/384/512), derive keys from passwords via PBKDF2, and perform HMAC operations. No external dependencies — uses Node.js built-in `crypto` module.

## Integration Steps

### TypeScript

1. **Import and configure**:
```typescript
import { Encryption } from "@radzor/encryption";

// Generate a key first (do this once, store securely)
const enc = new Encryption();
const key = enc.generateKey();
console.log("Store this key securely:", key);

// Use the key for encryption
const crypto = new Encryption({ key, encoding: "hex" });
```

2. **Encrypt data**:
```typescript
const payload = crypto.encrypt("sensitive data here");
// payload = { ciphertext, iv, tag, encoding }
// Store the entire payload object
```

3. **Decrypt data**:
```typescript
const plaintext = crypto.decrypt(payload);
console.log(plaintext); // "sensitive data here"
```

4. **With Additional Authenticated Data (AAD)**:
```typescript
const encrypted = crypto.encrypt("secret", "user:123");
const decrypted = crypto.decrypt(encrypted, "user:123"); // must match
```

5. **Hash data**:
```typescript
const hash = crypto.hash("data to hash", "sha256");
```

6. **Derive key from password**:
```typescript
const { key: derivedKey, salt } = await crypto.deriveKey("user-password");
// Store salt alongside the derived key
```

### Python

1. **Configure**:
```python
from encryption import Encryption

crypto = Encryption()
key = crypto.generate_key()
crypto = Encryption(key=key, encoding="hex")
```

2. **Encrypt and decrypt**:
```python
payload = crypto.encrypt("sensitive data")
plaintext = crypto.decrypt(payload)
```

3. **Hash**:
```python
digest = crypto.hash("data", algorithm="sha256")
```

## Environment Variables Required
- None required. Keys should be stored securely (e.g. in environment variables or a key management service).

## Constraints
- No external dependencies — uses Node.js built-in `crypto` module.
- Keys must be exactly 32 bytes (64 hex characters) for AES-256.
- Each encryption operation uses a unique random IV — never reuse IVs.
- Store encrypted payloads as structured objects (ciphertext + iv + tag).
- GCM authentication tag prevents tampering — decryption fails if data is modified.
- PBKDF2 key derivation uses 100,000 iterations by default.

## Composability
- Encrypted payloads can be stored via `@radzor/cache-store` or database.
- HMAC output can be used with `@radzor/webhook-receiver` for signature verification.
