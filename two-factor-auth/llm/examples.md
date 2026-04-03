# two-factor-auth — Examples

## Generate a secret and QR URI

### TypeScript

```typescript
import { TwoFactorAuth } from "./components/two-factor-auth/src";

const tfa = new TwoFactorAuth({ issuer: "MyApp" });
const secret = tfa.generateSecret("alice@example.com");

console.log("Secret:", secret.base32);
console.log("QR URI:", secret.otpauthUri);
// Use a QR library to render secret.otpauthUri as a QR code
```

### Python

```python
from components.two_factor_auth.src import TwoFactorAuth, TwoFactorConfig

tfa = TwoFactorAuth(TwoFactorConfig(issuer="MyApp"))
secret = tfa.generate_secret("alice@example.com")

print("Secret:", secret.base32)
print("QR URI:", secret.otpauth_uri)
```

## Verify a token

### TypeScript

```typescript
const valid = tfa.verifyToken("482901", secret.base32);
if (valid) {
  console.log("2FA verified");
} else {
  console.log("Invalid token");
}
```

### Python

```python
valid = tfa.verify_token("482901", secret.base32)
if valid:
    print("2FA verified")
else:
    print("Invalid token")
```

## Verify with wider time window

### TypeScript

```typescript
// Accept tokens ±2 periods (60 seconds each way)
const valid = tfa.verifyToken("482901", secret.base32, 2);
```

### Python

```python
valid = tfa.verify_token("482901", secret.base32, window=2)
```

## Generate QR URI for existing secret

### TypeScript

```typescript
const uri = tfa.generateQrUri("alice@example.com", "JBSWY3DPEHPK3PXP");
```

### Python

```python
uri = tfa.generate_qr_uri("alice@example.com", "JBSWY3DPEHPK3PXP")
```

## Event listeners

### TypeScript

```typescript
tfa.on("onVerified", (result) => {
  console.log(result.valid ? "OK" : "FAIL", result.token);
});

tfa.on("onError", (err) => {
  console.error(err.code, err.message);
});
```

### Python

```python
tfa.on("onVerified", lambda r: print("OK" if r["valid"] else "FAIL", r["token"]))
tfa.on("onError", lambda err: print(err["code"], err["message"]))
```
