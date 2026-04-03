# How to integrate @radzor/email-send

## Overview
Send transactional emails through Resend, SendGrid, or raw SMTP. Supports HTML and plain text, attachments, CC/BCC, reply-to, and batch sending. Zero external dependencies.

## Integration Steps

1. **Import and configure:**
```typescript
import { EmailSend } from "@radzor/email-send";

// Resend
const email = new EmailSend({
  provider: "resend",
  apiKey: process.env.RESEND_API_KEY!,
  from: "App <noreply@example.com>",
});

// SendGrid
const email = new EmailSend({
  provider: "sendgrid",
  apiKey: process.env.SENDGRID_API_KEY!,
  from: "noreply@example.com",
});

// SMTP
const email = new EmailSend({
  provider: "smtp",
  from: "noreply@example.com",
  smtpHost: "smtp.example.com",
  smtpPort: 587,
  smtpUser: process.env.SMTP_USER!,
  smtpPass: process.env.SMTP_PASS!,
});
```

2. **Send an email:**
```typescript
const result = await email.send({
  to: "user@example.com",
  subject: "Welcome!",
  html: "<h1>Hello</h1><p>Welcome to our app.</p>",
  text: "Hello. Welcome to our app.",
});
console.log(result.id); // Message ID
```

3. **With attachments:**
```typescript
await email.send({
  to: "user@example.com",
  subject: "Your invoice",
  html: "<p>Please find your invoice attached.</p>",
  attachments: [{
    filename: "invoice.pdf",
    content: pdfBuffer,
    contentType: "application/pdf",
  }],
});
```

4. **Batch send:**
```typescript
const results = await email.sendBatch(
  ["user1@example.com", "user2@example.com"],
  { subject: "Newsletter", html: "<h1>Monthly update</h1>" }
);
```

## Environment Variables
- `RESEND_API_KEY` — for Resend
- `SENDGRID_API_KEY` — for SendGrid
- `SMTP_USER` / `SMTP_PASS` — for SMTP

## Important Constraints
- The `from` address must be verified with your email provider
- Resend and SendGrid have free tiers with daily limits

## Python Integration

1. **Import and configure:**
```python
import os
from email_send import EmailSend, EmailSendConfig

# Resend
email = EmailSend(EmailSendConfig(
    provider="resend",
    api_key=os.environ["RESEND_API_KEY"],
    from_addr="App <noreply@example.com>",
))

# SMTP
email = EmailSend(EmailSendConfig(
    provider="smtp",
    from_addr="noreply@example.com",
    smtp_host="smtp.example.com",
    smtp_port=587,
    smtp_user=os.environ["SMTP_USER"],
    smtp_pass=os.environ["SMTP_PASS"],
))
```

2. **Send an email:**
```python
from email_send import EmailMessage

result = email.send(EmailMessage(
    to="user@example.com",
    subject="Welcome!",
    html="<h1>Hello</h1><p>Welcome to our app.</p>",
    text="Hello. Welcome to our app.",
))
print(result.id)
```

3. **With attachments:**
```python
from email_send import EmailAttachment

with open("invoice.pdf", "rb") as f:
    pdf_data = f.read()

email.send(EmailMessage(
    to="user@example.com",
    subject="Your invoice",
    html="<p>Please find your invoice attached.</p>",
    attachments=[EmailAttachment(filename="invoice.pdf", content=pdf_data, content_type="application/pdf")],
))
```

4. **Batch send:**
```python
results = email.send_batch(
    ["user1@example.com", "user2@example.com"],
    subject="Newsletter",
    html="<h1>Monthly update</h1>",
)
```
