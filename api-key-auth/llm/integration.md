# api-key-auth — Integration Guide

## Overview

API key authentication middleware. Generate, validate, hash, and revoke API keys with timing-safe comparison and SHA-256 hashing.

## Installation

```bash
radzor add api-key-auth
```

## Configuration

| Input        | Type   | Required | Description                                 |
| ------------ | ------ | -------- | ------------------------------------------- |
| `headerName` | string | no       | HTTP header name (default: `x-api-key`)     |
| `prefix`     | string | no       | API key prefix (default: `rz_`)             |

## Quick Start

### TypeScript

```typescript
import { ApiKeyAuth } from "./components/api-key-auth/src";

const auth = new ApiKeyAuth();

// Generate a key
const apiKey = auth.generateKey({ userId: "user-123" });
console.log("Key:", apiKey.key);
console.log("Hash:", apiKey.hash);

// Validate
const result = auth.validateKey(apiKey.key);
console.log(result.valid); // true
```

### Python

```python
from components.api_key_auth.src import ApiKeyAuth

auth = ApiKeyAuth()

api_key = auth.generate_key({"userId": "user-123"})
print("Key:", api_key.key)
print("Hash:", api_key.hash)

result = auth.validate_key(api_key.key)
print(result.valid)  # True
```

## Actions

### generateKey / generate_key — Generate a new prefixed API key
### validateKey / validate_key — Validate an API key (timing-safe)
### validateRequest / validate_request — Extract and validate key from HTTP headers
### hashKey / hash_key — SHA-256 hash a key for storage
### revokeKey / revoke_key — Revoke an API key

## Security

- Keys are hashed with SHA-256 before storage
- Validation uses timing-safe comparison to prevent timing attacks
- Revoked keys are tracked and rejected

## Requirements

- No external dependencies — uses stdlib only
