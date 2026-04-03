# Usage examples for @radzor/email-send

## Welcome email
```typescript
import { EmailSend } from "@radzor/email-send";

const email = new EmailSend({
  provider: "resend",
  apiKey: process.env.RESEND_API_KEY!,
  from: "MyApp <welcome@myapp.com>",
});

await email.send({
  to: "newuser@example.com",
  subject: "Welcome to MyApp!",
  html: `
    <h1>Welcome aboard!</h1>
    <p>Your account is ready. <a href="https://myapp.com/dashboard">Get started</a></p>
  `,
  text: "Welcome aboard! Your account is ready. Visit https://myapp.com/dashboard",
});
```

## Password reset with reply-to
```typescript
await email.send({
  to: "user@example.com",
  subject: "Reset your password",
  replyTo: "support@myapp.com",
  html: `<p>Click <a href="https://myapp.com/reset?token=abc123">here</a> to reset.</p>`,
});
```

## Invoice with PDF attachment
```typescript
import { readFileSync } from "node:fs";

const pdf = readFileSync("./invoices/INV-001.pdf");

await email.send({
  to: "client@example.com",
  cc: "billing@myapp.com",
  subject: "Invoice #INV-001",
  html: "<p>Please find your invoice attached.</p>",
  attachments: [{
    filename: "INV-001.pdf",
    content: pdf,
    contentType: "application/pdf",
  }],
});
```

## Error handling
```typescript
email.on("onSent", ({ id, to }) => {
  console.log(`Email ${id} sent to ${to.join(", ")}`);
});

email.on("onError", ({ code, message, provider }) => {
  console.error(`[${provider}] ${code}: ${message}`);
});

try {
  await email.send({ to: "user@example.com", subject: "Test", text: "Hello" });
} catch (err) {
  // Also throws for try/catch
}
```
