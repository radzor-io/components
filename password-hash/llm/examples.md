# @radzor/password-hash — Usage Examples

## User Registration Flow

```typescript
import { PasswordHash } from "@radzor/password-hash";

const hasher = new PasswordHash({ algorithm: "bcrypt", rounds: 12 });

async function registerUser(email: string, password: string) {
  const { score, feedback, strong } = hasher.checkStrength(password);
  if (!strong) {
    throw new Error(`Weak password: ${feedback.join(" ")}`);
  }

  const hash = await hasher.hash(password);
  await db.users.create({ email, passwordHash: hash });
}
```

## Login Verification

```typescript
async function loginUser(email: string, password: string): Promise<string> {
  const user = await db.users.findOne({ email });
  if (!user) throw new Error("Invalid credentials");

  const match = await hasher.verify(password, user.passwordHash);
  if (!match) throw new Error("Invalid credentials");

  return generateSessionToken(user.id);
}
```

## Strength Check API Endpoint

```typescript
app.post("/api/check-password", (req, res) => {
  const { password } = req.body;
  const result = hasher.checkStrength(password);

  res.json({
    score: result.score,       // 0 (very weak) to 4 (very strong)
    strong: result.strong,
    feedback: result.feedback,
  });
});
```

## Argon2id Mode for Passphrases

```typescript
const passphraseHasher = new PasswordHash({
  algorithm: "argon2id",
  memoryCost: 131072, // 128 MB — higher memory for brute-force resistance
  timeCost: 4,
});

const hash = await passphraseHasher.hash("correct horse battery staple");
const valid = await passphraseHasher.verify("correct horse battery staple", hash);
console.log(valid); // true
```

## Password Change with Re-verification

```typescript
async function changePassword(userId: string, oldPassword: string, newPassword: string) {
  const user = await db.users.findById(userId);

  const valid = await hasher.verify(oldPassword, user.passwordHash);
  if (!valid) throw new Error("Current password is incorrect");

  const { strong, feedback } = hasher.checkStrength(newPassword);
  if (!strong) throw new Error(`New password too weak: ${feedback.join(" ")}`);

  const newHash = await hasher.hash(newPassword);
  await db.users.update({ passwordHash: newHash }, { where: { id: userId } });
}
```
