# @radzor/magic-link-auth — Usage Examples

## Example 1: Generate and verify a basic magic link

```typescript
import { MagicLinkAuth } from "./components/magic-link-auth/src";

const auth = new MagicLinkAuth({
  secret: process.env.MAGIC_LINK_SECRET!,
  baseUrl: "https://myapp.com/auth/verify",
  tokenTtl: 900,
});

// On login request
const { url, expiresAt } = await auth.generateLink("user@example.com");
console.log(`Send this link (expires ${expiresAt.toISOString()}):\n${url}`);

// On verification callback — extract token from URL query string
const token = new URL(url).searchParams.get("token")!;
const { email, valid } = await auth.verifyToken(token);

if (valid) {
  console.log(`Authenticated as: ${email}`);
} else {
  console.log("Link invalid or expired.");
}
```

## Example 2: Express.js auth flow

```typescript
import express from "express";
import { MagicLinkAuth } from "./components/magic-link-auth/src";

const app = express();
const auth = new MagicLinkAuth({
  secret: process.env.MAGIC_LINK_SECRET!,
  baseUrl: "https://myapp.com/auth/verify",
  tokenTtl: 600,
  singleUse: true,
});

app.post("/auth/request", express.json(), async (req, res) => {
  const { email } = req.body;
  const { url } = await auth.generateLink(email);
  await sendEmail(email, `Your sign-in link: ${url}`);
  res.json({ message: "Check your email." });
});

app.get("/auth/verify", async (req, res) => {
  const token = req.query.token as string;
  const { email, valid } = await auth.verifyToken(token);
  if (!valid) return res.status(401).send("Invalid or expired link.");
  req.session.user = email;
  res.redirect("/dashboard");
});
```

## Example 3: Revoke a token before it expires

```typescript
import { MagicLinkAuth } from "./components/magic-link-auth/src";

const auth = new MagicLinkAuth({
  secret: "super-secret-key-32-bytes-minimum!!",
  baseUrl: "https://myapp.com/auth/verify",
});

const { token } = await auth.generateLink("user@example.com");

// Revoke it immediately (e.g., user requested a new link)
await auth.revokeToken(token);

// Subsequent verification will fail
const { valid } = await auth.verifyToken(token);
console.log(valid); // false
```

## Example 4: Listening to auth lifecycle events

```typescript
import { MagicLinkAuth } from "./components/magic-link-auth/src";

const auth = new MagicLinkAuth({
  secret: process.env.MAGIC_LINK_SECRET!,
  baseUrl: "https://myapp.com/auth/verify",
  tokenTtl: 300,
});

auth.on("onLinkSent", ({ email, url, expiresAt }) => {
  console.log(`Link generated for ${email}, expires ${expiresAt.toISOString()}`);
  // log to audit trail
});

auth.on("onVerified", ({ email }) => {
  console.log(`User verified: ${email}`);
  // record login event
});

auth.on("onExpired", ({ email, token }) => {
  console.warn(`Expired token used for ${email}`);
  // alert monitoring
});

auth.on("onError", ({ code, message }) => {
  console.error(`Auth error [${code}]: ${message}`);
});

await auth.generateLink("user@example.com");
```

## Example 5: Inspect token metadata

```typescript
import { MagicLinkAuth } from "./components/magic-link-auth/src";

const auth = new MagicLinkAuth({
  secret: process.env.MAGIC_LINK_SECRET!,
  baseUrl: "https://myapp.com/auth/verify",
  tokenTtl: 900,
  singleUse: true,
});

const { token } = await auth.generateLink("user@example.com");

// Before verification
const metaBefore = auth.getTokenMeta(token);
console.log(metaBefore?.email);    // "user@example.com"
console.log(metaBefore?.used);     // false

await auth.verifyToken(token);

// After verification (single-use token is now consumed)
const metaAfter = auth.getTokenMeta(token);
console.log(metaAfter?.used);      // true
```
