# @radzor/email-verify — Usage Examples

## Basic email verification
```typescript
import { EmailVerify } from "@radzor/email-verify";

const verifier = new EmailVerify({
  checkMx: true,
  checkDisposable: true,
  timeout: 5000,
});

const result = await verifier.verify("user@example.com");
console.log(result);
// {
//   email: "user@example.com",
//   valid: true,
//   syntaxValid: true,
//   mxExists: true,
//   disposable: false,
//   domain: "example.com",
// }
```

## Detect disposable emails
```typescript
const result = await verifier.verify("throwaway@guerrillamail.com");
console.log(result.valid);      // false
console.log(result.disposable); // true
console.log(result.reason);     // "Disposable email address"
```

## Invalid syntax detection
```typescript
const result = await verifier.verify("not-an-email");
console.log(result.valid);      // false
console.log(result.syntaxValid); // false
console.log(result.reason);     // "Invalid email syntax"
```

## Bulk verification for mailing lists
```typescript
const emails = [
  "alice@gmail.com",
  "bob@yahoo.com",
  "fake@tempmail.com",
  "invalid-format",
  "carol@company.com",
];

const results = await verifier.bulkVerify(emails, 5);

const valid = results.filter(r => r.valid);
const invalid = results.filter(r => !r.valid);

console.log(`Valid: ${valid.length}, Invalid: ${invalid.length}`);
for (const r of invalid) {
  console.log(`  ${r.email}: ${r.reason}`);
}
```

## Registration form validation (Express)
```typescript
app.post("/api/register", async (req, res) => {
  const { email, password } = req.body;

  const verification = await verifier.verify(email);

  if (!verification.valid) {
    return res.status(400).json({
      error: "Invalid email",
      reason: verification.reason,
      disposable: verification.disposable,
    });
  }

  // Proceed with registration...
  const user = await createUser(email, password);
  res.json({ userId: user.id });
});
```

## Event monitoring
```typescript
verifier.on("onVerified", ({ email, valid }) => {
  metrics.increment("email_verification", { valid: String(valid) });
});

verifier.on("onError", ({ email, message }) => {
  console.error(`Verification error for ${email}: ${message}`);
  // Fallback: accept the email if DNS is unreachable
});
```

---

## Python Examples

### Single verification
```python
from email_verify import EmailVerify

verifier = EmailVerify(check_mx=True, check_disposable=True)

result = verifier.verify("user@example.com")
if result.valid:
    print(f"{result.email} is valid (domain: {result.domain})")
else:
    print(f"Invalid: {result.reason}")
```

### Bulk verification
```python
emails = ["alice@gmail.com", "fake@tempmail.com", "bad-format"]
results = verifier.bulk_verify(emails, concurrency=5)

valid_emails = [r.email for r in results if r.valid]
print(f"Valid emails: {valid_emails}")
```

### Registration validation (FastAPI)
```python
from fastapi import FastAPI, HTTPException

app = FastAPI()

@app.post("/register")
async def register(email: str, password: str):
    result = verifier.verify(email)
    if not result.valid:
        raise HTTPException(400, detail=f"Invalid email: {result.reason}")
    user = create_user(email, password)
    return {"user_id": user.id}
```

### Disposable email filter (Django)
```python
def clean_email(email):
    result = verifier.verify(email)
    if result.disposable:
        raise ValidationError("Disposable email addresses are not allowed.")
    if not result.valid:
        raise ValidationError(f"Invalid email: {result.reason}")
    return result.email
```
