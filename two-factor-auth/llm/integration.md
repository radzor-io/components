# two-factor-auth — Integration Guide

## Overview

TOTP-based two-factor authentication (RFC 6238). Generate secrets, produce `otpauth://` URIs for QR codes, and verify 6-digit tokens from authenticator apps (Google Authenticator, Authy, etc.).

## Installation

```bash
radzor add two-factor-auth
```

## Configuration

| Input    | Type   | Required | Description                                    |
| -------- | ------ | -------- | ---------------------------------------------- |
| `issuer` | string | yes      | App name shown in authenticator apps            |
| `digits` | number | no       | OTP length (default: 6)                        |
| `period` | number | no       | Time step in seconds (default: 30)             |

## Quick Start

### TypeScript

```typescript
import { TwoFactorAuth } from "./components/two-factor-auth/src";

const tfa = new TwoFactorAuth({ issuer: "MyApp" });

// 1. Generate secret for a user
const secret = tfa.generateSecret("user@example.com");
// → Show secret.otpauthUri as QR code

// 2. Verify token from authenticator app
const valid = tfa.verifyToken("123456", secret.base32);
```

### Python

```python
from components.two_factor_auth.src import TwoFactorAuth, TwoFactorConfig

tfa = TwoFactorAuth(TwoFactorConfig(issuer="MyApp"))

secret = tfa.generate_secret("user@example.com")
valid = tfa.verify_token("123456", secret.base32)
```

## Actions

### generateSecret / generate_secret

Generate a 20-byte random secret. Returns `base32`, `hex`, and `otpauthUri`.

### generateQrUri / generate_qr_uri

Generate an `otpauth://` URI for an existing secret.

### verifyToken / verify_token

Verify a TOTP token against a base32 secret. Supports a configurable time window (default: ±1 period).

## Security notes

- Store the base32 secret securely (encrypted at rest)
- Use HTTPS to transmit secrets and tokens
- Implement rate limiting on verification attempts
- Consider backup codes for account recovery

## Requirements

- Node.js `crypto` module (TypeScript) or Python `hmac`/`hashlib` (Python)
- No external dependencies
