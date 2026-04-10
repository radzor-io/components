# How to integrate @radzor/email-verify

## Overview
Verify email addresses by checking syntax validity, MX record existence, and disposable email provider detection. Supports single and bulk verification with configurable checks. No external API dependencies — uses Node.js built-in DNS module.

## Integration Steps

### TypeScript

1. **Import and configure**:
```typescript
import { EmailVerify } from "@radzor/email-verify";

const verifier = new EmailVerify({
  checkMx: true,
  checkDisposable: true,
  timeout: 5000,
});
```

2. **Verify a single email**:
```typescript
const result = await verifier.verify("user@example.com");

if (result.valid) {
  console.log(`${result.email} is valid (domain: ${result.domain})`);
} else {
  console.log(`Invalid: ${result.reason}`);
}
```

3. **Bulk verify**:
```typescript
const results = await verifier.bulkVerify(
  ["a@example.com", "b@tempmail.com", "invalid-email"],
  10 // concurrency
);

const validEmails = results.filter(r => r.valid);
```

4. **Listen for events**:
```typescript
verifier.on("onVerified", ({ email, valid }) => {
  console.log(`${email}: ${valid ? "valid" : "invalid"}`);
});

verifier.on("onError", ({ email, message }) => {
  console.error(`Error verifying ${email}: ${message}`);
});
```

### Python

1. **Configure**:
```python
from email_verify import EmailVerify

verifier = EmailVerify(check_mx=True, check_disposable=True, timeout=5000)
```

2. **Verify**:
```python
result = verifier.verify("user@example.com")
if result.valid:
    print(f"{result.email} is valid")
else:
    print(f"Invalid: {result.reason}")
```

3. **Bulk verify**:
```python
results = verifier.bulk_verify(["a@example.com", "b@tempmail.com"], concurrency=10)
valid = [r for r in results if r.valid]
```

## Environment Variables Required
- None.

## Constraints
- No external dependencies — uses Node.js built-in `dns` module for MX lookups.
- MX checks require network/DNS access from the server.
- The disposable email list is bundled and covers common providers but is not exhaustive.
- Does not perform SMTP mailbox verification (does not connect to the mail server to check if the address exists).
- DNS lookups can timeout — configure `timeout` appropriately for your environment.

## Composability
- Verification results can gate `@radzor/email-send` to avoid sending to invalid addresses.
- Can be used as a pre-filter for `@radzor/email-template` rendering.
