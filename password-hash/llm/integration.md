# How to integrate @radzor/password-hash

## Overview
Secure password hashing using Node.js built-in `crypto.scrypt`. Supports bcrypt-compatible cost factors and argon2id-style memory/time parameters. All comparisons are timing-safe. Zero npm dependencies.

## Integration Steps

1. **Import and configure:**
```typescript
import { PasswordHash } from "@radzor/password-hash";

// bcrypt-style (cost factor 12 — recommended default)
const hasher = new PasswordHash({ algorithm: "bcrypt", rounds: 12 });

// argon2id-style (for passphrases and high-security contexts)
const strongHasher = new PasswordHash({
  algorithm: "argon2id",
  memoryCost: 65536, // 64 MB
  timeCost: 3,
});
```

2. **Hash a password at registration:**
```typescript
const hash = await hasher.hash(userPassword);
await db.users.update({ passwordHash: hash }, { where: { id: userId } });
```

3. **Verify at login:**
```typescript
const match = await hasher.verify(userPassword, storedHash);
if (!match) {
  throw new Error("Invalid credentials");
}
```

4. **Check strength before storing:**
```typescript
const { score, feedback, strong } = hasher.checkStrength(plainPassword);
if (!strong) {
  return res.status(400).json({ error: "Weak password", feedback });
}
```

5. **Listen for events:**
```typescript
hasher.on("onHashed", ({ algorithm }) => {
  console.log(`Password hashed with ${algorithm}`);
});
hasher.on("onError", ({ code, message }) => {
  console.error(`Hash error [${code}]: ${message}`);
});
```

## Constraints
- Never log or persist plaintext passwords — the library does not do so, and you must not either.
- bcrypt truncates at 72 bytes — if accepting long passwords/passphrases, use `algorithm: "argon2id"`.
- The stored hash format is `$radzor-scrypt$v1$N$r$p$salt$hash`. Do not reconstruct or parse this manually.
- `verify()` uses `crypto.timingSafeEqual` — always use it instead of plain equality checks.
- For production bcrypt interoperability with existing hashes, install `npm install bcrypt` separately.
- `rounds` values below 10 are not recommended for production.
