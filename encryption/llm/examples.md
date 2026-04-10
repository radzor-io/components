# @radzor/encryption — Usage Examples

## Generate a key and encrypt data
```typescript
import { Encryption } from "@radzor/encryption";

const enc = new Encryption();
const key = enc.generateKey();
console.log("Key (store securely):", key);

const crypto = new Encryption({ key, encoding: "hex" });
const payload = crypto.encrypt("sensitive user data");

// Store the entire payload object in your database
await db.secrets.create({
  ciphertext: payload.ciphertext,
  iv: payload.iv,
  tag: payload.tag,
  encoding: payload.encoding,
});
```

## Decrypt stored data
```typescript
const stored = await db.secrets.findById(secretId);
const plaintext = crypto.decrypt({
  ciphertext: stored.ciphertext,
  iv: stored.iv,
  tag: stored.tag,
  encoding: stored.encoding,
});
console.log("Decrypted:", plaintext);
```

## Encrypt with Additional Authenticated Data (AAD)
```typescript
// AAD binds the ciphertext to a context (e.g., user ID)
const payload = crypto.encrypt("secret-data", "user:12345");

// Decryption requires the same AAD
const plaintext = crypto.decrypt(payload, "user:12345"); // works
// crypto.decrypt(payload, "user:99999"); // throws — AAD mismatch
```

## Hash data for integrity checks
```typescript
const fileHash = crypto.hash(fileBuffer, "sha256");
console.log("SHA-256:", fileHash);

// Verify later
const currentHash = crypto.hash(fileBuffer, "sha256");
if (currentHash === fileHash) {
  console.log("File integrity verified");
}
```

## HMAC for API webhook verification
```typescript
app.post("/webhook", express.raw({ type: "*/*" }), (req, res) => {
  const signature = req.headers["x-signature"];
  const computed = crypto.hmac(req.body, "sha256");

  if (crypto.timingSafeEqual(signature, computed)) {
    console.log("Webhook signature valid");
    res.sendStatus(200);
  } else {
    console.log("Invalid signature");
    res.sendStatus(401);
  }
});
```

## Derive key from password (PBKDF2)
```typescript
// During account setup
const { key: derivedKey, salt } = await crypto.deriveKey("user-password");
// Store salt in the database (not the key)

// Later, to recreate the key from the password
const { key: recreated } = await crypto.deriveKey("user-password", salt);
// recreated === derivedKey

const userCrypto = new Encryption({ key: derivedKey });
const encrypted = userCrypto.encrypt("user's private data");
```

---

## Python Examples

### Generate key and encrypt
```python
from encryption import Encryption

enc = Encryption()
key = enc.generate_key()
print(f"Key: {key}")

crypto = Encryption(key=key, encoding="hex")
payload = crypto.encrypt("sensitive data")
print(payload)  # {"ciphertext": "...", "iv": "...", "tag": "...", "encoding": "hex"}
```

### Decrypt
```python
plaintext = crypto.decrypt(payload)
print(plaintext)  # "sensitive data"
```

### Hash
```python
digest = crypto.hash("data to hash", algorithm="sha256")
print(f"SHA-256: {digest}")
```

### Password-based key derivation
```python
result = crypto.derive_key("user-password")
print(f"Derived key: {result.key}")
print(f"Salt: {result.salt}")  # store this

# Recreate later
result2 = crypto.derive_key("user-password", salt=result.salt)
assert result.key == result2.key
```
